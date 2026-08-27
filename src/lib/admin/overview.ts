/**
 * Admin overview queries — totals, charts, funnel, activity feed, attention items.
 */
import { and, count, countDistinct, desc, eq, gte, isNotNull, lt, sql, sum } from "drizzle-orm";
import type { Db } from "../../db/client";
import { user } from "../../db/schema/auth";
import {
  creditBalanceOrg,
  creditLedger,
  purchase,
  subscription,
} from "../../db/schema/billing";
import {
  batchJob,
  feedback,
  generation,
  skillState,
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
