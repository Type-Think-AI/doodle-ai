/* Deciding what to push, pushing it, and recording what happened.
 *
 * Shared by two callers that must behave identically: the manual Sync button
 * (src/pages/api/admin/seo/sync.ts) and the hourly cron (src-worker/entry.ts).
 * A cron that has drifted from the button is a feature nobody can debug, so
 * there is one implementation and the only difference is the recorded `trigger`.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../../db/client";
import { seoSubmission, seoUrl } from "../../db/schema/seo";
import type { SecretLike } from "../secrets";
import { DB_BATCH } from "./batch";
import { resolveIndexNowConfig } from "./config";
import { discoverUrls, type DiscoverReport } from "./discover";
import { submitToIndexNow } from "./indexnow";
// From ./inventory, never ./pages: this module is reachable from
// src-worker/entry.ts, and ./pages pulls `astro:content` into a bundle wrangler
// builds. See the header of ./inventory.ts.
import { SITE_ORIGIN, absoluteUrl, type IndexablePage } from "./inventory";

/**
 * Ceiling on URLs pushed in one run.
 *
 * Not a protocol limit — IndexNow accepts 10,000 per POST and our corpus is
 * ~145 pages. It is a blast-radius limit: if a bug ever made every URL look
 * newly-changed, an hourly cron would push the endpoint into a 429 and get the
 * host treated as a spammer. Capping the run means the worst case is slow
 * rather than banned.
 */
const MAX_URLS_PER_RUN = 1_000;

export interface PendingUrl {
  id: number;
  path: string;
}

/**
 * URLs IndexNow has not been told about since they last changed.
 *
 * This predicate is the whole reason an hourly cron is safe. IndexNow exists to
 * report added/updated/deleted pages, and its FAQ explicitly warns against
 * resubmitting unchanged URLs — so a URL qualifies only when it has never had a
 * successful push, or when its content moved after the last successful push.
 * The healthy steady state is therefore zero submissions per hour.
 */
export async function selectPendingUrls(db: Db, engine = "indexnow"): Promise<PendingUrl[]> {
  const [urls, submissions] = await Promise.all([
    db
      .select({ id: seoUrl.id, path: seoUrl.path, contentLastmod: seoUrl.contentLastmod })
      .from(seoUrl)
      .where(isNull(seoUrl.removedAt)),
    db
      .select({ urlId: seoSubmission.urlId, submittedAt: seoSubmission.submittedAt })
      .from(seoSubmission)
      .where(and(eq(seoSubmission.engine, engine), eq(seoSubmission.ok, true))),
  ]);

  const lastOk = new Map<number, number>();
  for (const row of submissions) {
    const at = row.submittedAt.getTime();
    if ((lastOk.get(row.urlId) ?? 0) < at) lastOk.set(row.urlId, at);
  }

  return urls
    .filter((row) => {
      const pushed = lastOk.get(row.id);
      if (pushed === undefined) return true;
      // No lastmod (static pages like /about/) means there is nothing to compare
      // against, so one successful submission is enough — forever. Re-pushing a
      // page that never changes is exactly the abuse the FAQ warns about.
      const changedAt = row.contentLastmod?.getTime();
      return changedAt !== undefined && changedAt > pushed;
    })
    .map((row) => ({ id: row.id, path: row.path }));
}

export interface SyncReport {
  batchId: string;
  discovered: DiscoverReport;
  /** URLs actually pushed. 0 is the healthy steady state, not a failure. */
  submitted: number;
  ok: boolean;
  statusCode: number | null;
  error?: string;
  /** Set when the run could not even attempt a push. */
  skipped?: string;
}

/**
 * One full sync: discover, then push whatever is pending.
 *
 * `force` resubmits every live URL regardless of the pending predicate. It
 * exists for the initial seed and for recovering from a run that recorded a
 * false success, and it is an explicit admin action — never something the cron
 * does, because a forced hourly run is precisely how a host earns a 429.
 */
export async function syncIndexNow(
  db: Db,
  options: {
    env: Record<string, SecretLike> | undefined;
    origin?: string;
    trigger: "manual" | "cron";
    force?: boolean;
    /**
     * How to read the page inventory. Injected so the Astro caller can pass
     * `listIndexablePages` and the cron can pass `fetchPageInventory` — see
     * ./discover.ts for why this cannot simply be imported.
     */
    loadPages: () => Promise<IndexablePage[]>;
  },
): Promise<SyncReport> {
  const origin = options.origin ?? SITE_ORIGIN;
  const batchId = `sync_${crypto.randomUUID()}`;
  const discovered = await discoverUrls(db, await options.loadPages());

  const resolved = await resolveIndexNowConfig(options.env, origin);
  if ("unavailable" in resolved) {
    // Discovery still ran and still counts. Reporting it separately from the
    // push is what stops a missing key from looking like a broken tracker.
    return {
      batchId,
      discovered,
      submitted: 0,
      ok: false,
      statusCode: null,
      skipped: resolved.unavailable,
    };
  }

  const pending = options.force
    ? await db
        .select({ id: seoUrl.id, path: seoUrl.path })
        .from(seoUrl)
        .where(isNull(seoUrl.removedAt))
    : await selectPendingUrls(db);

  if (pending.length === 0) {
    return { batchId, discovered, submitted: 0, ok: true, statusCode: null };
  }

  const batch = pending.slice(0, MAX_URLS_PER_RUN);
  const result = await submitToIndexNow(
    batch.map((row) => absoluteUrl(row.path, origin)),
    resolved.config,
  );

  await recordSubmissions(db, {
    urlIds: batch.map((row) => row.id),
    engine: "indexnow",
    batchId,
    trigger: options.trigger,
    statusCode: result.statusCode,
    ok: result.ok,
    error: result.error,
  });

  return {
    batchId,
    discovered,
    submitted: batch.length,
    ok: result.ok,
    statusCode: result.statusCode,
    error: result.error,
  };
}

/**
 * Write one submission row per URL from a single batch result.
 *
 * Being explicit about what this is: IndexNow answers a batch with ONE status
 * code and no body, so every row from a batch necessarily carries the same
 * outcome. That is a real limit of the protocol rather than an approximation we
 * chose — but it does mean a row here reads "this URL was in a batch that got a
 * 200", not "this URL was individually accepted". Per-URL rows are still the
 * right shape, because the table's job is answering "when did we last tell them
 * about THIS page", which is well-defined either way.
 */
async function recordSubmissions(
  db: Db,
  write: {
    urlIds: number[];
    engine: string;
    batchId: string;
    trigger: "manual" | "cron";
    statusCode: number | null;
    ok: boolean;
    error?: string;
  },
): Promise<void> {
  if (write.urlIds.length === 0) return;
  const submittedAt = new Date();
  const rows = write.urlIds.map((urlId) => ({
    urlId,
    engine: write.engine,
    batchId: write.batchId,
    trigger: write.trigger,
    statusCode: write.statusCode,
    ok: write.ok,
    error: write.error ?? null,
    submittedAt,
  }));

  for (let i = 0; i < rows.length; i += DB_BATCH) {
    await db.insert(seoSubmission).values(rows.slice(i, i + DB_BATCH));
  }
}
