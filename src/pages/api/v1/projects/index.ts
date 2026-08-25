import type { APIContext } from "astro";
import { and, count, desc, eq } from "drizzle-orm";
import { getDb, withDbSession } from "../../../../db/client";
import { asset, project } from "../../../../db/schema/product";
import { apiError, apiJson, requireOrg } from "../../../../lib/auth/guards";
import { intParam, newId, optStr, readJson } from "../../../../lib/api/body";
import type { ProjectDto, ProjectStatus } from "../../../../lib/api/dto";

export const prerender = false;

const PAGE_DEFAULT = 100;
const PAGE_MAX = 500;
const NAME_MAX_LEN = 80;
const BRIEF_MAX_LEN = 4000;

/**
 * `assetCount` is not a column — it comes from the grouped join in GET, and
 * from an explicit 0 on a freshly created project. Callers that already know
 * the count (the detail route re-counts) pass it in rather than this mapper
 * guessing.
 */
export function toProjectDto(row: typeof project.$inferSelect, assetCount: number): ProjectDto {
  return {
    id: row.id,
    name: row.name,
    brief: row.brief,
    status: row.status === "archived" ? "archived" : "active",
    assetCount,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export function parseStatus(value: unknown): ProjectStatus | null {
  return value === "active" || value === "archived" ? value : null;
}

/**
 * GET /api/v1/projects?status=active|archived — newest-updated first.
 *
 * The asset count comes from a LEFT JOIN + GROUP BY rather than a per-row
 * subquery so the list is one round trip to D1 regardless of how many
 * projects a team has.
 */
export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { project: ["read"] });
  if (org instanceof Response) return org;

  const url = new URL(context.request.url);
  const status = parseStatus(url.searchParams.get("status")) ?? "active";
  const limit = intParam(url, "limit", PAGE_DEFAULT, PAGE_MAX);

  const { db, commit } = withDbSession(context);
  const rows = await db
    .select({ row: project, assetCount: count(asset.id) })
    .from(project)
    .leftJoin(asset, eq(asset.projectId, project.id))
    .where(and(eq(project.organizationId, org.orgId), eq(project.status, status)))
    .groupBy(project.id)
    .orderBy(desc(project.updatedAt))
    .limit(limit);

  return commit(apiJson({ projects: rows.map((r) => toProjectDto(r.row, r.assetCount)) }));
}

/** POST /api/v1/projects — `{ name, brief? }`. */
export async function POST(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { project: ["create"] });
  if (org instanceof Response) return org;

  const body = await readJson(context.request);
  const name = body ? optStr(body.name) : null;
  if (!name) return apiError("bad_request", "`name` is required.", 400);

  const now = new Date();
  const values = {
    id: optStr(body?.id) ?? newId(),
    organizationId: org.orgId,
    name: name.slice(0, NAME_MAX_LEN),
    brief: optStr(body?.brief)?.slice(0, BRIEF_MAX_LEN) ?? null,
    status: "active",
    createdBy: org.user.id,
    createdAt: now,
    updatedAt: now,
  } satisfies typeof project.$inferInsert;

  const db = getDb(context);
  await db.insert(project).values(values).onConflictDoNothing({ target: project.id });

  return apiJson({ project: toProjectDto(values, 0) }, 201);
}

/** Shared with the detail route so both clamp identically. */
export const LIMITS = { NAME_MAX_LEN, BRIEF_MAX_LEN };
