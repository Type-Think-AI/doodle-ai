/**
 * Admin project, skill, batch, and nav-badge queries.
 */
import { and, count, countDistinct, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { organization, user } from "../../db/schema/auth";
import { subscription } from "../../db/schema/billing";
import {
  asset,
  batchItem,
  batchJob,
  feedback,
  generation,
  project,
  shareLink,
  skillState,
} from "../../db/schema/product";
import { compact, num } from "./shared";

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
 * are returned.
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
