/* Reading and writing the availability history behind /status.
 *
 * See migrations/0015_status_history.sql for why samples come from the hourly
 * cron rather than the request path.
 */

import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { statusSample } from "../../db/schema";
import { isObserved, type ObservedState, type StatusPayload } from "./types";

/** The window the page reports on. */
export const WINDOW_DAYS = 90;
/** Buckets in the history strip. One per window day keeps it readable. */
export const STRIP_BUCKETS = 90;
/** Samples are pruned past the window; nothing reads beyond it. */
const RETENTION_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

export interface ComponentHistory {
  states: ObservedState[];
  /** Fraction of observations that were operational, or null with no data. */
  uptime: number | null;
}

/**
 * Load per-component history for the reported window.
 *
 * One query for every component rather than one per component: at ~15 probes
 * that is the difference between a single scan and fifteen round trips on a page
 * that is meant to load fast even while the system is unhealthy.
 */
export async function loadHistory(db: Db): Promise<Map<string, ComponentHistory>> {
  const since = new Date(Date.now() - RETENTION_MS);
  const rows = await db
    .select({
      component: statusSample.component,
      state: statusSample.state,
      checkedAt: statusSample.checkedAt,
    })
    .from(statusSample)
    .where(gte(statusSample.checkedAt, since))
    .orderBy(desc(statusSample.checkedAt))
    .limit(20000);

  const byComponent = new Map<string, { state: ObservedState; at: number }[]>();
  for (const row of rows) {
    const state = row.state as ObservedState;
    if (!isObserved(state)) continue; // defensive: metered must never be stored
    const list = byComponent.get(row.component) ?? [];
    list.push({ state, at: row.checkedAt.getTime() });
    byComponent.set(row.component, list);
  }

  const out = new Map<string, ComponentHistory>();
  const windowStart = Date.now() - RETENTION_MS;
  const bucketMs = RETENTION_MS / STRIP_BUCKETS;

  for (const [component, samples] of byComponent) {
    // Worst-of-bucket, not average: a strip whose job is to show incidents must
    // not let 23 good hours hide the hour the product was down.
    const buckets: (ObservedState | null)[] = Array.from({ length: STRIP_BUCKETS }, () => null);
    for (const s of samples) {
      const idx = Math.min(STRIP_BUCKETS - 1, Math.floor((s.at - windowStart) / bucketMs));
      if (idx < 0) continue;
      const current = buckets[idx];
      if (current === "down") continue;
      if (s.state === "down" || current === null || (s.state === "degraded" && current === "operational")) {
        buckets[idx] = s.state;
      }
    }

    const operational = samples.filter((s) => s.state === "operational").length;
    out.set(component, {
      states: buckets.filter((b): b is ObservedState => b !== null),
      uptime: samples.length > 0 ? operational / samples.length : null,
    });
  }

  return out;
}

/**
 * Persist one observation per probed component, then prune the window.
 *
 * Called only from the scheduled handler. Metered components are skipped rather
 * than stored with a placeholder, so they can never contribute to an uptime
 * number we publish.
 */
export async function recordSamples(db: Db, payload: StatusPayload): Promise<number> {
  const now = new Date();
  const rows = payload.components
    .filter((c) => isObserved(c.state))
    .map((c) => ({
      component: c.id,
      state: c.state,
      latencyMs: c.latencyMs,
      checkedAt: now,
    }));

  if (rows.length === 0) return 0;
  await db.insert(statusSample).values(rows);

  // Retention in the same tick that writes. Doing it here rather than in a
  // separate job means the table cannot grow unbounded if that job is forgotten.
  await db.delete(statusSample).where(lt(statusSample.checkedAt, new Date(Date.now() - RETENTION_MS)));

  return rows.length;
}

/** Most recent recorded state for one component, for the footer indicator. */
export async function latestState(db: Db, component: string): Promise<ObservedState | null> {
  const [row] = await db
    .select({ state: statusSample.state })
    .from(statusSample)
    .where(eq(statusSample.component, component))
    .orderBy(desc(statusSample.checkedAt))
    .limit(1);
  return (row?.state as ObservedState) ?? null;
}

/** Count of samples in the window, for "based on N checks" copy. */
export async function sampleCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(statusSample)
    .where(and(gte(statusSample.checkedAt, new Date(Date.now() - RETENTION_MS))));
  return Number(row?.n ?? 0);
}
