/**
 * Admin overview queries — totals, charts, funnel, activity feed, attention items.
 */
import { and, count, countDistinct, desc, eq, gte, lt, sql, sum } from "drizzle-orm";
import type { Db } from "../../db/client";
import { user } from "../../db/schema/auth";
import {
  creditLedger,
  purchase,
  subscription,
} from "../../db/schema/billing";
import {
  batchJob,
  feedback,
  generation,
  skillState,
  thread,
} from "../../db/schema/product";
import { type DailyPoint, fillDailyGaps, formatUsd, num, truncate } from "./shared";

/* ------------------------------------------------------------------ *
 * Overview
 * ------------------------------------------------------------------ */

export interface OverviewTotals {
  users: number;
  usersThisWeek: number;
  generations: number;
  generationsThisWeek: number;
  creditsIssued: number;
  creditsUsed: number;
  payingSeats: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function getOverviewTotals(db: Db): Promise<OverviewTotals> {
  const weekAgo = new Date(Date.now() - WEEK_MS);

  const [
    userRows,
    userWeekRows,
    genRows,
    genWeekRows,
    issuedRows,
    usedRows,
    seatRows,
  ] = await db.batch([
    db.select({ n: count() }).from(user),
    db.select({ n: count() }).from(user).where(gte(user.createdAt, weekAgo)),
    db.select({ n: count() }).from(generation).where(eq(generation.status, "ok")),
    db
      .select({ n: count() })
      .from(generation)
      .where(and(eq(generation.status, "ok"), gte(generation.createdAt, weekAgo))),
    db.select({ total: sum(creditLedger.delta) }).from(creditLedger).where(gte(creditLedger.delta, 1)),
    db.select({ total: sum(creditLedger.delta) }).from(creditLedger).where(lt(creditLedger.delta, 0)),
    db.select({ n: count() }).from(subscription).where(eq(subscription.status, "active")),
  ]);

  return {
    users: num(userRows[0]?.n),
    usersThisWeek: num(userWeekRows[0]?.n),
    generations: num(genRows[0]?.n),
    generationsThisWeek: num(genWeekRows[0]?.n),
    creditsIssued: num(issuedRows[0]?.total),
    creditsUsed: Math.abs(num(usedRows[0]?.total)),
    payingSeats: num(seatRows[0]?.n),
  };
}

/** Successful generations per day for the last `days`, oldest first, gaps filled with 0. */
export async function getGenerationsByDay(db: Db, days = 14): Promise<DailyPoint[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${generation.createdAt} / 1000, 'unixepoch')`.as("day"),
      value: count(),
    })
    .from(generation)
    .where(and(eq(generation.status, "ok"), gte(generation.createdAt, since)))
    .groupBy(sql`day`)
    .orderBy(sql`day`);

  return fillDailyGaps(rows.map((r) => ({ day: r.day, value: num(r.value) })), days);
}

export interface WeeklyCredits {
  week: string;
  issued: number;
  used: number;
}

/** Credits issued vs used per ISO week for the last `weeks`, oldest first. */
export async function getCreditsByWeek(db: Db, weeks = 10): Promise<WeeklyCredits[]> {
  const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      week: sql<string>`strftime('%Y-%W', ${creditLedger.createdAt} / 1000, 'unixepoch')`.as("week"),
      issued: sql<number>`COALESCE(SUM(CASE WHEN ${creditLedger.delta} > 0 THEN ${creditLedger.delta} ELSE 0 END), 0)`,
      used: sql<number>`COALESCE(SUM(CASE WHEN ${creditLedger.delta} < 0 THEN -${creditLedger.delta} ELSE 0 END), 0)`,
    })
    .from(creditLedger)
    .where(gte(creditLedger.createdAt, since))
    .groupBy(sql`week`)
    .orderBy(sql`week`);

  return rows.map((r) => ({ week: r.week, issued: num(r.issued), used: num(r.used) }));
}

export interface FunnelStage {
  label: string;
  value: number;
  pct: number;
}

/**
 * Signup → first generation → paying, as absolute counts.
 */
export async function getActivationFunnel(db: Db): Promise<FunnelStage[]> {
  const [totalRows, activatedRows, payingRows] = await db.batch([
    db.select({ n: count() }).from(user),
    db
      .select({ n: countDistinct(generation.userId) })
      .from(generation)
      .where(eq(generation.status, "ok")),
    db.select({ n: countDistinct(subscription.userId) }).from(subscription).where(eq(subscription.status, "active")),
  ]);

  const total = num(totalRows[0]?.n);
  const activated = num(activatedRows[0]?.n);
  const paying = num(payingRows[0]?.n);
  const pct = (v: number) => (total === 0 ? 0 : Math.round((v / total) * 1000) / 10);

  return [
    { label: "Signed up", value: total, pct: total === 0 ? 0 : 100 },
    { label: "Made first doodle", value: activated, pct: pct(activated) },
    { label: "Upgraded to Pro", value: paying, pct: pct(paying) },
  ];
}

export interface SkillMixSlice {
  skillId: string;
  runs: number;
  pct: number;
}

/** Share of successful generations per skill, largest first. */
export async function getSkillMix(db: Db, limit = 4): Promise<SkillMixSlice[]> {
  const rows = await db
    .select({ skillId: generation.skillId, runs: count() })
    .from(generation)
    .where(eq(generation.status, "ok"))
    .groupBy(generation.skillId)
    .orderBy(desc(count()));

  const total = rows.reduce((acc, r) => acc + num(r.runs), 0);
  if (total === 0) return [];

  const top = rows.slice(0, limit).map((r) => ({
    skillId: r.skillId,
    runs: num(r.runs),
    pct: Math.round((num(r.runs) / total) * 100),
  }));

  const remainder = total - top.reduce((acc, r) => acc + r.runs, 0);
  if (remainder > 0) {
    top.push({ skillId: "__other", runs: remainder, pct: Math.round((remainder / total) * 100) });
  }
  return top;
}

export interface ActivityEvent {
  kind: "signup" | "generation" | "credit" | "feedback";
  text: string;
  at: Date;
}

/**
 * A merged recent-events feed.
 */
export async function getRecentActivity(db: Db, limit = 8): Promise<ActivityEvent[]> {
  const [signups, gens, credits, feedbacks] = await db.batch([
    db
      .select({ name: user.name, email: user.email, at: user.createdAt })
      .from(user)
      .orderBy(desc(user.createdAt))
      .limit(limit),
    db
      .select({ skillId: generation.skillId, at: generation.createdAt, name: user.name })
      .from(generation)
      .innerJoin(user, eq(generation.userId, user.id))
      .where(eq(generation.status, "ok"))
      .orderBy(desc(generation.createdAt))
      .limit(limit),
    db
      .select({ delta: creditLedger.delta, reason: creditLedger.reason, at: creditLedger.createdAt, name: user.name })
      .from(creditLedger)
      .innerJoin(user, eq(creditLedger.userId, user.id))
      .orderBy(desc(creditLedger.createdAt))
      .limit(limit),
    db
      .select({ text: feedback.text, at: feedback.createdAt, name: user.name })
      .from(feedback)
      .innerJoin(user, eq(feedback.userId, user.id))
      .orderBy(desc(feedback.createdAt))
      .limit(limit),
  ]);

  const events: ActivityEvent[] = [
    ...signups.map((r) => ({
      kind: "signup" as const,
      text: `${r.name || r.email} signed up`,
      at: r.at,
    })),
    ...gens.map((r) => ({
      kind: "generation" as const,
      text: `${r.name} ran ${r.skillId}`,
      at: r.at,
    })),
    ...credits.map((r) => ({
      kind: "credit" as const,
      text:
        r.delta > 0
          ? `${r.name} received ${r.delta} credits (${r.reason})`
          : `${r.name} spent ${Math.abs(r.delta)} credits`,
      at: r.at,
    })),
    ...feedbacks.map((r) => ({
      kind: "feedback" as const,
      text: `${r.name} left feedback: ${truncate(r.text, 60)}`,
      at: r.at,
    })),
  ];

  return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

export interface AttentionItem {
  title: string;
  detail: string;
  href: string;
  tone: "red" | "accent" | "blue" | "green";
}

/** Real problems worth surfacing, computed rather than authored. */
export async function getNeedsAttention(db: Db): Promise<AttentionItem[]> {
  const [failedRows, inactiveRows, stuckRows, newFeedbackRows, pausedRows] = await db.batch([
    db
      .select({ n: count(), cents: sum(purchase.amountCents) })
      .from(purchase)
      .where(eq(purchase.status, "failed")),
    db
      .select({ n: count() })
      .from(user)
      .leftJoin(generation, and(eq(generation.userId, user.id), eq(generation.status, "ok")))
      .where(sql`${generation.id} IS NULL`),
    db.select({ n: count() }).from(batchJob).where(eq(batchJob.status, "running")),
    db.select({ n: count() }).from(feedback).where(eq(feedback.status, "new")),
    db.select({ n: count() }).from(skillState).where(eq(skillState.state, "paused")),
  ]);

  const items: AttentionItem[] = [];

  const failed = num(failedRows[0]?.n);
  if (failed > 0) {
    items.push({
      title: `${failed} ${failed === 1 ? "payment" : "payments"} failed to charge`,
      detail: `${formatUsd(num(failedRows[0]?.cents))} at risk`,
      href: "/admin/billing",
      tone: "red",
    });
  }

  const inactive = num(inactiveRows[0]?.n);
  if (inactive > 0) {
    items.push({
      title: `${inactive} ${inactive === 1 ? "user" : "users"} never made a doodle`,
      detail: "Signed up but zero successful generations",
      href: "/admin/users",
      tone: "accent",
    });
  }

  const stuck = num(stuckRows[0]?.n);
  if (stuck > 0) {
    items.push({
      title: `${stuck} batch ${stuck === 1 ? "job" : "jobs"} still running`,
      detail: "The hourly cron sweep refunds anything stuck too long",
      href: "/admin/batches",
      tone: "blue",
    });
  }

  const newFeedback = num(newFeedbackRows[0]?.n);
  if (newFeedback > 0) {
    items.push({
      title: `${newFeedback} untriaged ${newFeedback === 1 ? "message" : "messages"}`,
      detail: "Feedback nobody has looked at yet",
      href: "/admin/feedback",
      tone: "green",
    });
  }

  const paused = num(pausedRows[0]?.n);
  if (paused > 0) {
    items.push({
      title: `${paused} ${paused === 1 ? "skill is" : "skills are"} paused`,
      detail: "Paused skills refuse new runs",
      href: "/admin/skills",
      tone: "blue",
    });
  }

  return items;
}

/* ------------------------------------------------------------------ *
 * Product analytics — feature usage & underused/problem signals
 *
 * All queries here are windowed (default last 30 days) and start from the
 * canonical GENERATION_MODES list, LEFT JOINed against generations, so a
 * skill nobody has ever run still appears with a real 0 — a GROUP BY over
 * `generation` alone can never surface a zero-usage skill.
 * ------------------------------------------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface FeatureUsageRow {
  /** Raw GENERATION_MODES id — the caller maps it to a friendly name. */
  skillId: string;
  /** Every generation attempt in the window, any status. */
  attempts: number;
  /** Successful generations (status = 'ok') in the window. */
  runs: number;
  /** attempts as a share of the busiest skill's attempts, 0–100. */
  barPct: number;
}

/**
 * Per-skill generation counts over the window, busiest first, ZERO-usage
 * skills included at the bottom. Built by counting the window's generations
 * per skillId in one grouped query, then folding those counts onto the full
 * canonical skill list in code so unused skills are never dropped.
 */
export async function getFeatureUsage(
  db: Db,
  skillIds: readonly string[],
  days = 30,
): Promise<FeatureUsageRow[]> {
  const since = new Date(Date.now() - days * DAY_MS);
  const rows = await db
    .select({
      skillId: generation.skillId,
      attempts: count(),
      runs: sql<number>`COALESCE(SUM(CASE WHEN ${generation.status} = 'ok' THEN 1 ELSE 0 END), 0)`,
    })
    .from(generation)
    .where(gte(generation.createdAt, since))
    .groupBy(generation.skillId);

  const bySkill = new Map(rows.map((r) => [r.skillId, { attempts: num(r.attempts), runs: num(r.runs) }]));

  // Start from the canonical list so zero-usage skills are present. Any
  // skillId seen in generations but not in the canonical list (a retired or
  // renamed skill) is appended so its usage is never silently lost.
  const known = new Set(skillIds);
  const extras = [...bySkill.keys()].filter((id) => !known.has(id));
  const allIds = [...skillIds, ...extras];

  const maxAttempts = Math.max(0, ...allIds.map((id) => bySkill.get(id)?.attempts ?? 0));

  return allIds
    .map((skillId) => {
      const hit = bySkill.get(skillId);
      const attempts = hit?.attempts ?? 0;
      return {
        skillId,
        attempts,
        runs: hit?.runs ?? 0,
        barPct: maxAttempts === 0 ? 0 : Math.round((attempts / maxAttempts) * 100),
      };
    })
    .sort((a, b) => b.attempts - a.attempts);
}

export interface SkillFailureRow {
  skillId: string;
  attempts: number;
  failed: number;
  /** failed / attempts as a percentage, 0–100 (one decimal). */
  failureRate: number;
}

export interface UnderusedSignals {
  /** Window length in days, echoed for the panel copy. */
  windowDays: number;

  /** Canonical skills with 0 generation attempts in the window. */
  zeroUsageSkillIds: string[];
  totalSkills: number;

  /** Platform-wide failed / total across all skills in the window, 0–100. */
  platformFailureRate: number;
  /** Skills whose failure rate exceeds the platform average (min 5 attempts to be meaningful), worst first. */
  highFailureSkills: SkillFailureRow[];

  /** Overall generation success rate (ok / total) in the window, 0–100. */
  successRate: number;
  totalAttempts: number;
  totalOk: number;

  /** Threads created in the window with zero successful generations. */
  abandonedThreads: number;
  totalThreads: number;
  /** abandonedThreads / totalThreads, 0–100. */
  abandonedThreadPct: number;
}

/** Minimum attempts before a per-skill failure rate is worth flagging. */
const FAILURE_FLAG_MIN_ATTEMPTS = 5;

/**
 * Underused / problem signals over the window: zero-usage skills, per-skill
 * failure rates above the platform average, abandoned chats, and the overall
 * success rate. Every number is derived from D1; nothing is seeded.
 */
export async function getUnderusedSignals(
  db: Db,
  skillIds: readonly string[],
  days = 30,
): Promise<UnderusedSignals> {
  const since = new Date(Date.now() - days * DAY_MS);

  const [perSkillRows, threadTotalRows, abandonedRows] = await db.batch([
    // Per-skill attempts + failures in the window.
    db
      .select({
        skillId: generation.skillId,
        attempts: count(),
        failed: sql<number>`COALESCE(SUM(CASE WHEN ${generation.status} = 'failed' THEN 1 ELSE 0 END), 0)`,
        ok: sql<number>`COALESCE(SUM(CASE WHEN ${generation.status} = 'ok' THEN 1 ELSE 0 END), 0)`,
      })
      .from(generation)
      .where(gte(generation.createdAt, since))
      .groupBy(generation.skillId),
    // All threads created in the window.
    db.select({ n: count() }).from(thread).where(gte(thread.createdAt, since)),
    // Threads created in the window with zero successful generations. A LEFT
    // JOIN onto only the 'ok' generations, keeping thread rows where none
    // matched, counts "started but never got a result".
    db
      .select({ n: count() })
      .from(thread)
      .leftJoin(generation, and(eq(generation.threadId, thread.id), eq(generation.status, "ok")))
      .where(and(gte(thread.createdAt, since), sql`${generation.id} IS NULL`)),
  ]);

  const bySkill = new Map(
    perSkillRows.map((r) => [
      r.skillId,
      { attempts: num(r.attempts), failed: num(r.failed), ok: num(r.ok) },
    ]),
  );

  // Zero-usage skills, counted against the canonical list.
  const zeroUsageSkillIds = skillIds.filter((id) => (bySkill.get(id)?.attempts ?? 0) === 0);

  // Platform-wide totals in the window.
  let totalAttempts = 0;
  let totalFailed = 0;
  let totalOk = 0;
  for (const v of bySkill.values()) {
    totalAttempts += v.attempts;
    totalFailed += v.failed;
    totalOk += v.ok;
  }
  const platformFailureRate = totalAttempts === 0 ? 0 : Math.round((totalFailed / totalAttempts) * 1000) / 10;
  const successRate = totalAttempts === 0 ? 0 : Math.round((totalOk / totalAttempts) * 1000) / 10;

  // Skills above the platform failure rate (with enough attempts to be real).
  const highFailureSkills: SkillFailureRow[] = [...bySkill.entries()]
    .map(([skillId, v]) => ({
      skillId,
      attempts: v.attempts,
      failed: v.failed,
      failureRate: v.attempts === 0 ? 0 : Math.round((v.failed / v.attempts) * 1000) / 10,
    }))
    .filter((r) => r.attempts >= FAILURE_FLAG_MIN_ATTEMPTS && r.failureRate > platformFailureRate)
    .sort((a, b) => b.failureRate - a.failureRate);

  const totalThreads = num(threadTotalRows[0]?.n);
  const abandonedThreads = num(abandonedRows[0]?.n);
  const abandonedThreadPct = totalThreads === 0 ? 0 : Math.round((abandonedThreads / totalThreads) * 1000) / 10;

  return {
    windowDays: days,
    zeroUsageSkillIds,
    totalSkills: skillIds.length,
    platformFailureRate,
    highFailureSkills,
    successRate,
    totalAttempts,
    totalOk,
    abandonedThreads,
    totalThreads,
    abandonedThreadPct,
  };
}
