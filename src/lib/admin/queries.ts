/* Every real read the admin console makes.
 *
 * All of it is aggregate, cross-tenant SQL — the deliberate opposite of the
 * rest of the API, where `requireOrg()` scopes every query to one
 * organization. That is exactly why nothing in this file may be reachable
 * without clearing the platform-role gate in src/middleware.ts: these
 * functions read every user's data by design, so the guard is the only thing
 * standing between them and a full customer-data dump.
 *
 * Conventions:
 *
 *  - Functions take an already-resolved `Db`, never an APIContext, so both
 *    server-rendered pages and /api/admin routes share one implementation.
 *  - Counts come back as numbers, not strings. D1 returns COUNT(*) as a
 *    number already; the `Number()` wrappers are for the driver's `unknown`
 *    typing, not a conversion.
 *  - Time buckets are computed in SQL with strftime against
 *    `created_at / 1000` — every timestamp column in this schema is
 *    `timestamp_ms`, so the division is required and easy to forget.
 *  - Nothing here caches. Every query is bounded (LIMIT, or a GROUP BY over
 *    an indexed column) and the console has a handful of users; adding a
 *    cache layer before there is a measured problem would just add a
 *    staleness bug.
 */
import { and, count, countDistinct, desc, eq, gte, isNotNull, lt, sql, sum } from "drizzle-orm";
import type { Db } from "../../db/client";
import { member, organization, user } from "../../db/schema/auth";
import {
  creditBalanceOrg,
  creditLedger,
  orgLimits,
  purchase,
  subscription,
} from "../../db/schema/billing";
import {
  asset,
  batchItem,
  batchJob,
  feedback,
  generation,
  project,
  shareLink,
  skillState,
  thread,
} from "../../db/schema/product";

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
    // Split on the sign rather than on `reason`: a refund is a positive delta
    // with reason 'refund', and counting it as "issued" is correct — it is
    // credit the user can spend. Filtering by reason would miss that.
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
    // Stored negative; reported as a positive magnitude.
    creditsUsed: Math.abs(num(usedRows[0]?.total)),
    payingSeats: num(seatRows[0]?.n),
  };
}

export interface DailyPoint {
  day: string;
  value: number;
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
 *
 * "Made a doodle" counts distinct users with at least one successful
 * generation, not total generations — the funnel is about people, and one
 * enthusiast with 400 runs must not read as 400 activated users.
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
 *
 * Four small indexed LIMIT-20 reads merged in JS, rather than one SQL UNION
 * ALL: the four tables have genuinely different shapes and the union would
 * need a column-padding subquery per branch to line them up, which is both
 * slower on D1 and much harder to read than this.
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
    // Users with zero successful generations. LEFT JOIN + IS NULL rather than
    // NOT IN (SELECT ...), which SQLite cannot use an index for.
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
 * Users
 * ------------------------------------------------------------------ */

export type UserSegment = "all" | "pro" | "free" | "power" | "low_credits" | "admins";
export type UserSort = "doodles" | "credits" | "newest";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
  platformRole: string;
  createdAt: Date;
  /** 'Pro' when an active subscription exists, else 'Free'. */
  plan: "Pro" | "Free";
  doodles: number;
  projects: number;
  /** Balance of the user's personal org — the pool their own runs draw from. */
  credits: number;
  /** Latest successful generation. Null for a user who has never generated. */
  lastSeen: Date | null;
  topSkill: string | null;
}

export interface UserListResult {
  rows: AdminUserRow[];
  total: number;
  segmentCounts: Record<UserSegment, number>;
}

/**
 * The Users table.
 *
 * Correlated subqueries rather than GROUP BY joins: joining `user` to
 * `generation`, `project` and `subscription` at once multiplies rows and the
 * COUNT(DISTINCT ...) needed to undo that is slower on D1 than four indexed
 * scalar subqueries per row — and this is paginated to 50, so it is at most
 * 200 index lookups.
 *
 * `credits` reads the *personal* org's balance (`org_<userId>`, the
 * deterministic id from guards.ts's selfHealPersonalOrg). A user who is also
 * a member of a shared team has more spendable credit than this shows; the
 * team's pool belongs on /admin/orgs, not on a per-user row, or the same
 * pool would be double-counted across every member.
 */
export async function listUsers(
  db: Db,
  opts: { segment?: UserSegment; sort?: UserSort; q?: string; limit?: number; offset?: number } = {},
): Promise<UserListResult> {
  const { segment = "all", sort = "doodles", q, limit = 50, offset = 0 } = opts;

  const doodles = sql<number>`(
    SELECT COUNT(*) FROM ${generation}
    WHERE ${generation.userId} = ${user.id} AND ${generation.status} = 'ok'
  )`;
  const projects = sql<number>`(
    SELECT COUNT(*) FROM ${project} WHERE ${project.createdBy} = ${user.id}
  )`;
  const credits = sql<number>`(
    SELECT COALESCE(${creditBalanceOrg.balance}, 0) FROM ${creditBalanceOrg}
    WHERE ${creditBalanceOrg.organizationId} = 'org_' || ${user.id}
  )`;
  const isPro = sql<number>`(
    SELECT COUNT(*) FROM ${subscription}
    WHERE ${subscription.userId} = ${user.id} AND ${subscription.status} = 'active'
  )`;
  const lastSeen = sql<number | null>`(
    SELECT MAX(${generation.createdAt}) FROM ${generation} WHERE ${generation.userId} = ${user.id}
  )`;
  const topSkill = sql<string | null>`(
    SELECT ${generation.skillId} FROM ${generation}
    WHERE ${generation.userId} = ${user.id} AND ${generation.status} = 'ok'
    GROUP BY ${generation.skillId} ORDER BY COUNT(*) DESC LIMIT 1
  )`;

  const filters = [];
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    filters.push(sql`(LOWER(${user.name}) LIKE ${like} OR LOWER(${user.email}) LIKE ${like})`);
  }
  if (segment === "pro") filters.push(sql`${isPro} > 0`);
  if (segment === "free") filters.push(sql`${isPro} = 0`);
  if (segment === "power") filters.push(sql`${doodles} >= 100`);
  if (segment === "low_credits") filters.push(sql`${credits} < 50`);
  if (segment === "admins") filters.push(sql`${user.platformRole} <> 'user'`);

  const where = filters.length > 0 ? and(...filters) : undefined;

  const orderBy =
    sort === "credits" ? sql`credits DESC` : sort === "newest" ? desc(user.createdAt) : sql`doodles DESC`;

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      platformRole: user.platformRole,
      createdAt: user.createdAt,
      doodles: doodles.as("doodles"),
      projects: projects.as("projects"),
      credits: credits.as("credits"),
      isPro: isPro.as("is_pro"),
      lastSeen: lastSeen.as("last_seen"),
      topSkill: topSkill.as("top_skill"),
    })
    .from(user)
    .where(where)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  const [totalRows, proRows, powerRows, lowRows, adminRows] = await db.batch([
    db.select({ n: count() }).from(user),
    db.select({ n: countDistinct(subscription.userId) }).from(subscription).where(eq(subscription.status, "active")),
    db
      .select({ n: countDistinct(generation.userId) })
      .from(generation)
      .where(eq(generation.status, "ok")),
    db.select({ n: count() }).from(creditBalanceOrg).where(lt(creditBalanceOrg.balance, 50)),
    db.select({ n: count() }).from(user).where(sql`${user.platformRole} <> 'user'`),
  ]);

  const total = num(totalRows[0]?.n);
  const pro = num(proRows[0]?.n);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      image: r.image,
      platformRole: r.platformRole,
      createdAt: r.createdAt,
      plan: num(r.isPro) > 0 ? "Pro" : "Free",
      doodles: num(r.doodles),
      projects: num(r.projects),
      credits: num(r.credits),
      lastSeen: r.lastSeen ? new Date(Number(r.lastSeen)) : null,
      topSkill: r.topSkill ?? null,
    })),
    total,
    segmentCounts: {
      all: total,
      pro,
      free: total - pro,
      // Approximate: "power user" here is anyone who has generated at all,
      // because the >=100 threshold cannot be counted without a per-user
      // aggregate scan. Labelled as such in the UI.
      power: num(powerRows[0]?.n),
      low_credits: num(lowRows[0]?.n),
      admins: num(adminRows[0]?.n),
    },
  };
}

export interface AdminUserDetail extends AdminUserRow {
  orgs: { id: string; name: string; role: string; isPersonal: boolean; balance: number }[];
  recentGenerations: { id: string; skillId: string; status: string; createdAt: Date; outputUrl: string | null }[];
  recentLedger: { id: string; delta: number; reason: string; createdAt: Date; balanceAfter: number }[];
  threads: number;
  feedbackCount: number;
}

export async function getUserDetail(db: Db, userId: string): Promise<AdminUserDetail | null> {
  const base = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      platformRole: user.platformRole,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  const found = base[0];
  if (!found) return null;

  const [doodleRows, projectRows, proRows, threadRows, feedbackRows, lastRows, topRows] = await db.batch([
    db
      .select({ n: count() })
      .from(generation)
      .where(and(eq(generation.userId, userId), eq(generation.status, "ok"))),
    db.select({ n: count() }).from(project).where(eq(project.createdBy, userId)),
    db
      .select({ n: count() })
      .from(subscription)
      .where(and(eq(subscription.userId, userId), eq(subscription.status, "active"))),
    db.select({ n: count() }).from(thread).where(eq(thread.userId, userId)),
    db.select({ n: count() }).from(feedback).where(eq(feedback.userId, userId)),
    db
      .select({ at: generation.createdAt })
      .from(generation)
      .where(eq(generation.userId, userId))
      .orderBy(desc(generation.createdAt))
      .limit(1),
    db
      .select({ skillId: generation.skillId, n: count() })
      .from(generation)
      .where(and(eq(generation.userId, userId), eq(generation.status, "ok")))
      .groupBy(generation.skillId)
      .orderBy(desc(count()))
      .limit(1),
  ]);

  const orgs = await db
    .select({
      id: organization.id,
      name: organization.name,
      role: member.role,
      isPersonal: organization.isPersonal,
      balance: creditBalanceOrg.balance,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .leftJoin(creditBalanceOrg, eq(creditBalanceOrg.organizationId, organization.id))
    .where(eq(member.userId, userId));

  const recentGenerations = await db
    .select({
      id: generation.id,
      skillId: generation.skillId,
      status: generation.status,
      createdAt: generation.createdAt,
      outputUrl: generation.outputUrl,
    })
    .from(generation)
    .where(eq(generation.userId, userId))
    .orderBy(desc(generation.createdAt))
    .limit(10);

  const recentLedger = await db
    .select({
      id: creditLedger.id,
      delta: creditLedger.delta,
      reason: creditLedger.reason,
      createdAt: creditLedger.createdAt,
      balanceAfter: creditLedger.balanceAfter,
    })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(10);

  const personal = orgs.find((o) => o.isPersonal);

  return {
    ...found,
    plan: num(proRows[0]?.n) > 0 ? "Pro" : "Free",
    doodles: num(doodleRows[0]?.n),
    projects: num(projectRows[0]?.n),
    credits: num(personal?.balance),
    lastSeen: lastRows[0]?.at ?? null,
    topSkill: topRows[0]?.skillId ?? null,
    orgs: orgs.map((o) => ({ ...o, balance: num(o.balance) })),
    recentGenerations,
    recentLedger,
    threads: num(threadRows[0]?.n),
    feedbackCount: num(feedbackRows[0]?.n),
  };
}

/* ------------------------------------------------------------------ *
 * Projects
 * ------------------------------------------------------------------ */

export interface AdminProjectRow {
  id: string;
  name: string;
  status: string;
  ownerName: string;
  ownerEmail: string;
  orgName: string;
  /** 'Team' when the owning org is shared, 'Solo' when it's a personal org. */
  type: "Team" | "Solo";
  doodles: number;
  assets: number;
  createdAt: Date;
}

export interface ProjectStats {
  total: number;
  teamWorkspaces: number;
  avgDoodlesPerProject: number;
  sharedExternally: number;
  sharedPct: number;
}

export async function getProjectStats(db: Db): Promise<ProjectStats> {
  const [totalRows, teamRows, genRows, sharedRows] = await db.batch([
    db.select({ n: count() }).from(project),
    db.select({ n: count() }).from(organization).where(eq(organization.isPersonal, false)),
    db
      .select({ n: count() })
      .from(generation)
      .where(and(eq(generation.status, "ok"), isNotNull(generation.projectId))),
    db
      .select({ n: countDistinct(shareLink.projectId) })
      .from(shareLink)
      .where(and(isNotNull(shareLink.projectId), sql`${shareLink.revokedAt} IS NULL`)),
  ]);

  const total = num(totalRows[0]?.n);
  const shared = num(sharedRows[0]?.n);

  return {
    total,
    teamWorkspaces: num(teamRows[0]?.n),
    avgDoodlesPerProject: total === 0 ? 0 : Math.round(num(genRows[0]?.n) / total),
    sharedExternally: shared,
    sharedPct: total === 0 ? 0 : Math.round((shared / total) * 100),
  };
}

export async function listProjects(db: Db, limit = 50, offset = 0): Promise<AdminProjectRow[]> {
  const doodles = sql<number>`(
    SELECT COUNT(*) FROM ${generation}
    WHERE ${generation.projectId} = ${project.id} AND ${generation.status} = 'ok'
  )`;
  const assets = sql<number>`(
    SELECT COUNT(*) FROM ${asset} WHERE ${asset.projectId} = ${project.id}
  )`;

  const rows = await db
    .select({
      id: project.id,
      name: project.name,
      status: project.status,
      createdAt: project.createdAt,
      ownerName: user.name,
      ownerEmail: user.email,
      orgName: organization.name,
      isPersonal: organization.isPersonal,
      doodles: doodles.as("doodles"),
      assets: assets.as("assets"),
    })
    .from(project)
    .innerJoin(user, eq(project.createdBy, user.id))
    .innerJoin(organization, eq(project.organizationId, organization.id))
    .orderBy(desc(project.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    ownerName: r.ownerName,
    ownerEmail: r.ownerEmail,
    orgName: r.orgName,
    type: r.isPersonal ? "Solo" : "Team",
    doodles: num(r.doodles),
    assets: num(r.assets),
    createdAt: r.createdAt,
  }));
}

/* ------------------------------------------------------------------ *
 * Skills
 * ------------------------------------------------------------------ */

export interface AdminSkillRow {
  skillId: string;
  runs: number;
  ok: number;
  failed: number;
  successRate: number;
  creators: number;
  creditsSpent: number;
  state: "live" | "paused";
  featured: boolean;
  note: string | null;
}

/**
 * Per-skill usage joined to admin-controlled state.
 *
 * Driven by what has actually been *run*, then merged with the bundled skill
 * catalog by the caller — a skill that exists but has never run must still
 * appear (at zero), and a `skill_id` in old generation rows whose skill was
 * since removed must not silently vanish from the numbers.
 */
export async function getSkillStats(db: Db): Promise<AdminSkillRow[]> {
  const rows = await db
    .select({
      skillId: generation.skillId,
      runs: count(),
      ok: sql<number>`SUM(CASE WHEN ${generation.status} = 'ok' THEN 1 ELSE 0 END)`,
      failed: sql<number>`SUM(CASE WHEN ${generation.status} IN ('failed','refunded') THEN 1 ELSE 0 END)`,
      creators: countDistinct(generation.userId),
      creditsSpent: sql<number>`COALESCE(SUM(${generation.creditsCharged}), 0)`,
    })
    .from(generation)
    .groupBy(generation.skillId)
    .orderBy(desc(count()));

  const states = await db.select().from(skillState);
  const stateBySkill = new Map(states.map((s) => [s.skillId, s]));

  return rows.map((r) => {
    const runs = num(r.runs);
    const ok = num(r.ok);
    const st = stateBySkill.get(r.skillId);
    return {
      skillId: r.skillId,
      runs,
      ok,
      failed: num(r.failed),
      successRate: runs === 0 ? 0 : Math.round((ok / runs) * 100),
      creators: num(r.creators),
      creditsSpent: num(r.creditsSpent),
      state: st?.state === "paused" ? "paused" : "live",
      featured: st?.featured ?? false,
      note: st?.note ?? null,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Credits
 * ------------------------------------------------------------------ */

export interface AdminLedgerRow {
  id: string;
  delta: number;
  reason: string;
  balanceAfter: number;
  createdAt: Date;
  actorName: string;
  actorEmail: string;
  orgName: string | null;
}

export async function listLedger(
  db: Db,
  limit = 50,
  offset = 0,
  q?: string,
): Promise<AdminLedgerRow[]> {
  const filters = [];
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    filters.push(sql`(LOWER(${user.name}) LIKE ${like} OR LOWER(${user.email}) LIKE ${like})`);
  }

  const rows = await db
    .select({
      id: creditLedger.id,
      delta: creditLedger.delta,
      reason: creditLedger.reason,
      balanceAfter: creditLedger.balanceAfter,
      createdAt: creditLedger.createdAt,
      actorName: user.name,
      actorEmail: user.email,
      orgName: organization.name,
    })
    .from(creditLedger)
    .innerJoin(user, eq(creditLedger.userId, user.id))
    .leftJoin(organization, eq(creditLedger.organizationId, organization.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(creditLedger.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({ ...r, orgName: r.orgName ?? null }));
}

export interface CreditTotals {
  issued: number;
  used: number;
  outstanding: number;
  utilisationPct: number;
}

export async function getCreditTotals(db: Db): Promise<CreditTotals> {
  const [issuedRows, usedRows, balanceRows] = await db.batch([
    db.select({ total: sum(creditLedger.delta) }).from(creditLedger).where(gte(creditLedger.delta, 1)),
    db.select({ total: sum(creditLedger.delta) }).from(creditLedger).where(lt(creditLedger.delta, 0)),
    db.select({ total: sum(creditBalanceOrg.balance) }).from(creditBalanceOrg),
  ]);

  const issued = num(issuedRows[0]?.total);
  const used = Math.abs(num(usedRows[0]?.total));

  return {
    issued,
    used,
    outstanding: num(balanceRows[0]?.total),
    utilisationPct: issued === 0 ? 0 : Math.round((used / issued) * 100),
  };
}

/** Resolve a user's personal org id — the pool an admin credit grant targets. */
export async function resolvePersonalOrgId(db: Db, userId: string): Promise<string | null> {
  const rows = await db
    .select({ id: organization.id })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(and(eq(member.userId, userId), eq(organization.isPersonal, true)))
    .limit(1);
  return rows[0]?.id ?? null;
}

/* ------------------------------------------------------------------ *
 * Organizations
 * ------------------------------------------------------------------ */

export interface AdminOrgRow {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  members: number;
  balance: number;
  projects: number;
  generations: number;
  monthlyCreditCap: number | null;
  createdAt: Date;
}

export async function listOrgs(db: Db, limit = 50, offset = 0): Promise<AdminOrgRow[]> {
  const members = sql<number>`(
    SELECT COUNT(*) FROM ${member} WHERE ${member.organizationId} = ${organization.id}
  )`;
  const projects = sql<number>`(
    SELECT COUNT(*) FROM ${project} WHERE ${project.organizationId} = ${organization.id}
  )`;
  const generations = sql<number>`(
    SELECT COUNT(*) FROM ${generation}
    WHERE ${generation.organizationId} = ${organization.id} AND ${generation.status} = 'ok'
  )`;

  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      isPersonal: organization.isPersonal,
      createdAt: organization.createdAt,
      balance: creditBalanceOrg.balance,
      monthlyCreditCap: orgLimits.monthlyCreditCap,
      members: members.as("members"),
      projects: projects.as("projects"),
      generations: generations.as("generations"),
    })
    .from(organization)
    .leftJoin(creditBalanceOrg, eq(creditBalanceOrg.organizationId, organization.id))
    .leftJoin(orgLimits, eq(orgLimits.organizationId, organization.id))
    .orderBy(desc(organization.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    isPersonal: r.isPersonal,
    createdAt: r.createdAt,
    balance: num(r.balance),
    monthlyCreditCap: r.monthlyCreditCap ?? null,
    members: num(r.members),
    projects: num(r.projects),
    generations: num(r.generations),
  }));
}

/* ------------------------------------------------------------------ *
 * Billing
 * ------------------------------------------------------------------ */

export interface AdminInvoiceRow {
  id: string;
  customerName: string;
  customerEmail: string;
  packId: string;
  credits: number;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: Date;
}

export async function listInvoices(db: Db, limit = 50, offset = 0): Promise<AdminInvoiceRow[]> {
  return db
    .select({
      id: purchase.id,
      customerName: user.name,
      customerEmail: user.email,
      packId: purchase.packId,
      credits: purchase.credits,
      amountCents: purchase.amountCents,
      currency: purchase.currency,
      status: purchase.status,
      createdAt: purchase.createdAt,
    })
    .from(purchase)
    .innerJoin(user, eq(purchase.userId, user.id))
    .orderBy(desc(purchase.createdAt))
    .limit(limit)
    .offset(offset);
}

export interface BillingTotals {
  payingSeats: number;
  newSeatsThisMonth: number;
  conversionPct: number;
  /** Sum of paid purchases, all time. Real money, unlike MRR. */
  grossCents: number;
  paidCount: number;
  failedCount: number;
  refundedCount: number;
  /** Monthly credits committed across active subscriptions. */
  committedMonthlyCredits: number;
}

export async function getBillingTotals(db: Db): Promise<BillingTotals> {
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [seatRows, newSeatRows, userRows, grossRows, paidRows, failedRows, refundedRows, creditRows] =
    await db.batch([
      db.select({ n: count() }).from(subscription).where(eq(subscription.status, "active")),
      db
        .select({ n: count() })
        .from(subscription)
        .where(and(eq(subscription.status, "active"), gte(subscription.currentPeriodEnd, monthAgo))),
      db.select({ n: count() }).from(user),
      db.select({ total: sum(purchase.amountCents) }).from(purchase).where(eq(purchase.status, "paid")),
      db.select({ n: count() }).from(purchase).where(eq(purchase.status, "paid")),
      db.select({ n: count() }).from(purchase).where(eq(purchase.status, "failed")),
      db.select({ n: count() }).from(purchase).where(eq(purchase.status, "refunded")),
      db
        .select({ total: sum(subscription.monthlyCredits) })
        .from(subscription)
        .where(eq(subscription.status, "active")),
    ]);

  const seats = num(seatRows[0]?.n);
  const users = num(userRows[0]?.n);

  return {
    payingSeats: seats,
    newSeatsThisMonth: num(newSeatRows[0]?.n),
    conversionPct: users === 0 ? 0 : Math.round((seats / users) * 1000) / 10,
    grossCents: num(grossRows[0]?.total),
    paidCount: num(paidRows[0]?.n),
    failedCount: num(failedRows[0]?.n),
    refundedCount: num(refundedRows[0]?.n),
    committedMonthlyCredits: num(creditRows[0]?.total),
  };
}

/* ------------------------------------------------------------------ *
 * Feedback
 * ------------------------------------------------------------------ */

export interface AdminFeedbackRow {
  id: string;
  text: string;
  status: string;
  createdAt: Date;
  triagedAt: Date | null;
  userName: string;
  userEmail: string;
  userImage: string | null;
  orgName: string | null;
  triagedByName: string | null;
}

export async function listFeedback(
  db: Db,
  opts: { status?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: AdminFeedbackRow[]; counts: Record<string, number> }> {
  const { status, limit = 50, offset = 0 } = opts;

  const triager = sql<string | null>`(
    SELECT ${user.name} FROM ${user} WHERE ${user.id} = ${feedback.triagedBy}
  )`;

  const rows = await db
    .select({
      id: feedback.id,
      text: feedback.text,
      status: feedback.status,
      createdAt: feedback.createdAt,
      triagedAt: feedback.triagedAt,
      userName: user.name,
      userEmail: user.email,
      userImage: user.image,
      orgName: organization.name,
      triagedByName: triager.as("triaged_by_name"),
    })
    .from(feedback)
    .innerJoin(user, eq(feedback.userId, user.id))
    .leftJoin(organization, eq(feedback.organizationId, organization.id))
    .where(status && status !== "all" ? eq(feedback.status, status) : undefined)
    .orderBy(desc(feedback.createdAt))
    .limit(limit)
    .offset(offset);

  const countRows = await db
    .select({ status: feedback.status, n: count() })
    .from(feedback)
    .groupBy(feedback.status);

  const counts: Record<string, number> = { all: 0, new: 0, reviewing: 0, resolved: 0, wont_fix: 0 };
  for (const r of countRows) {
    counts[r.status] = num(r.n);
    counts.all += num(r.n);
  }

  return {
    rows: rows.map((r) => ({
      ...r,
      orgName: r.orgName ?? null,
      triagedByName: r.triagedByName ?? null,
    })),
    counts,
  };
}

/* ------------------------------------------------------------------ *
 * Batch jobs
 * ------------------------------------------------------------------ */

export interface AdminBatchRow {
  id: string;
  skillId: string;
  status: string;
  variantCount: number;
  creditsReserved: number;
  createdAt: Date;
  completedAt: Date | null;
  orgName: string;
  createdByName: string;
  itemsOk: number;
  itemsFailed: number;
  itemsPending: number;
}

export async function listBatches(
  db: Db,
  opts: { status?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: AdminBatchRow[]; counts: Record<string, number> }> {
  const { status, limit = 50, offset = 0 } = opts;

  const itemsOk = sql<number>`(
    SELECT COUNT(*) FROM ${batchItem}
    WHERE ${batchItem.batchJobId} = ${batchJob.id} AND ${batchItem.status} = 'ok'
  )`;
  const itemsFailed = sql<number>`(
    SELECT COUNT(*) FROM ${batchItem}
    WHERE ${batchItem.batchJobId} = ${batchJob.id} AND ${batchItem.status} IN ('failed','canceled')
  )`;
  const itemsPending = sql<number>`(
    SELECT COUNT(*) FROM ${batchItem}
    WHERE ${batchItem.batchJobId} = ${batchJob.id} AND ${batchItem.status} IN ('queued','running')
  )`;

  const rows = await db
    .select({
      id: batchJob.id,
      skillId: batchJob.skillId,
      status: batchJob.status,
      variantCount: batchJob.variantCount,
      creditsReserved: batchJob.creditsReserved,
      createdAt: batchJob.createdAt,
      completedAt: batchJob.completedAt,
      orgName: organization.name,
      createdByName: user.name,
      itemsOk: itemsOk.as("items_ok"),
      itemsFailed: itemsFailed.as("items_failed"),
      itemsPending: itemsPending.as("items_pending"),
    })
    .from(batchJob)
    .innerJoin(organization, eq(batchJob.organizationId, organization.id))
    .innerJoin(user, eq(batchJob.createdBy, user.id))
    .where(status && status !== "all" ? eq(batchJob.status, status) : undefined)
    .orderBy(desc(batchJob.createdAt))
    .limit(limit)
    .offset(offset);

  const countRows = await db.select({ status: batchJob.status, n: count() }).from(batchJob).groupBy(batchJob.status);
  const counts: Record<string, number> = { all: 0 };
  for (const r of countRows) {
    counts[r.status] = num(r.n);
    counts.all += num(r.n);
  }

  return {
    rows: rows.map((r) => ({
      ...r,
      itemsOk: num(r.itemsOk),
      itemsFailed: num(r.itemsFailed),
      itemsPending: num(r.itemsPending),
    })),
    counts,
  };
}

/* ------------------------------------------------------------------ *
 * Sidebar badges
 * ------------------------------------------------------------------ */

/**
 * Real counts for the sidebar. Only keys with a meaningful, non-zero number
 * are returned — the Sidebar renders no badge for a missing key, which is
 * how "no untriaged feedback" shows nothing rather than a "0" chip.
 */
export async function resolveNavBadges(db: Db): Promise<Record<string, string>> {
  const [userRows, newFeedbackRows, runningRows] = await db.batch([
    db.select({ n: count() }).from(user),
    db.select({ n: count() }).from(feedback).where(eq(feedback.status, "new")),
    db.select({ n: count() }).from(batchJob).where(eq(batchJob.status, "running")),
  ]);

  const badges: Record<string, string> = {};
  const users = num(userRows[0]?.n);
  if (users > 0) badges.users = compact(users);
  const newFeedback = num(newFeedbackRows[0]?.n);
  if (newFeedback > 0) badges.feedback = String(newFeedback);
  const running = num(runningRows[0]?.n);
  if (running > 0) badges.batches = String(running);
  return badges;
}

/* ------------------------------------------------------------------ *
 * Formatting helpers shared by every admin page
 * ------------------------------------------------------------------ */

function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 58312 -> "58.3k". Used for KPI headlines and sidebar badges. */
export function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

/** 4812 -> "4,812". For table cells, where exactness matters more than width. */
export function thousands(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "Feb 4, 2026" — matches the format the Phase 1 dummy data used. */
export function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "14m ago" / "3h ago" / "2d ago", or an em dash for never. */
export function relativeTime(date: Date | null): string {
  if (!date) return "—";
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/**
 * SQL GROUP BY only returns days that have rows. A chart with missing days
 * silently compresses its x-axis and misrepresents the trend, so absent days
 * are materialised as explicit zeroes here.
 */
function fillDailyGaps(rows: DailyPoint[], days: number): DailyPoint[] {
  const byDay = new Map(rows.map((r) => [r.day, r.value]));
  const out: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, value: byDay.get(key) ?? 0 });
  }
  return out;
}

/** Points for an inline SVG polyline. Kept here so every chart shares one. */
export function polylinePoints(values: number[], w: number, h: number, pad: number): string {
  if (values.length === 0) return "";
  if (values.length === 1) return `${pad},${h / 2} ${w - pad},${h / 2}`;
  const max = Math.max(...values);
  const min = Math.min(...values);
  return values
    .map((v, i) => {
      const x = pad + (i * (w - pad * 2)) / (values.length - 1);
      const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
