/**
 * Admin user queries — list, detail, segments.
 */
import { and, count, countDistinct, desc, eq, lt, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { member, organization, user } from "../../db/schema/auth";
import {
  creditBalanceOrg,
  creditLedger,
  subscription,
} from "../../db/schema/billing";
import {
  feedback,
  generation,
  project,
  thread,
} from "../../db/schema/product";
import { num } from "./shared";

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
  plan: "Pro" | "Free";
  doodles: number;
  projects: number;
  credits: number;
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
