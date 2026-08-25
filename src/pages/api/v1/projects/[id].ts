import type { APIContext } from "astro";
import { and, count, eq } from "drizzle-orm";
import { getDb, withDbSession } from "../../../../db/client";
import { asset, project } from "../../../../db/schema/product";
import { apiError, apiJson, requireOrg } from "../../../../lib/auth/guards";
import { optStr, readJson } from "../../../../lib/api/body";
import { LIMITS, parseStatus, toProjectDto } from "./index";

export const prerender = false;

/**
 * A project belonging to another team reads as 404, never 403 — same
 * reasoning as src/pages/api/v1/threads/[id].ts: a 403 would confirm the id
 * exists, which is exactly what an enumeration probe is asking.
 */
function notFound(): Response {
  return apiError("not_found", "That project doesn't exist.", 404);
}

async function countAssets(db: ReturnType<typeof getDb>, projectId: string): Promise<number> {
  const rows = await db.select({ n: count() }).from(asset).where(eq(asset.projectId, projectId));
  return rows[0]?.n ?? 0;
}

export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { project: ["read"] });
  if (org instanceof Response) return org;
  const id = context.params.id;
  if (!id) return notFound();

  const { db, commit } = withDbSession(context);
  const rows = await db
    .select()
    .from(project)
    .where(and(eq(project.id, id), eq(project.organizationId, org.orgId)))
    .limit(1);

  const row = rows[0];
  if (!row) return commit(notFound());
  return commit(apiJson({ project: toProjectDto(row, await countAssets(db, id)) }));
}

/** PATCH /api/v1/projects/:id — `{ name?, brief?, status? }`. */
export async function PATCH(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { project: ["update"] });
  if (org instanceof Response) return org;
  const id = context.params.id;
  if (!id) return notFound();

  const body = await readJson(context.request);
  if (!body) return apiError("bad_request", "Expected a JSON body.", 400);

  const patch: Partial<typeof project.$inferInsert> = { updatedAt: new Date() };
  if ("name" in body) {
    const name = optStr(body.name);
    if (!name) return apiError("bad_request", "`name` can't be empty.", 400);
    patch.name = name.slice(0, LIMITS.NAME_MAX_LEN);
  }
  // `brief: null` is the clear signal, so presence of the key matters here
  // rather than truthiness of the value.
  if ("brief" in body) patch.brief = optStr(body.brief)?.slice(0, LIMITS.BRIEF_MAX_LEN) ?? null;
  if ("status" in body) {
    const status = parseStatus(body.status);
    if (!status) return apiError("bad_request", "`status` must be 'active' or 'archived'.", 400);
    patch.status = status;
  }

  const db = getDb(context);
  // The organizationId predicate is what makes this safe: a row belonging to
  // another team updates nothing, and `returning()` reports which happened
  // without a prior read.
  const updated = await db
    .update(project)
    .set(patch)
    .where(and(eq(project.id, id), eq(project.organizationId, org.orgId)))
    .returning();

  const row = updated[0];
  if (!row) return notFound();
  return apiJson({ project: toProjectDto(row, await countAssets(db, id)) });
}

/**
 * DELETE /api/v1/projects/:id — archives by default.
 *
 * A project is the container for a client's whole review history, so the
 * destructive read of "delete" is the wrong default: `?hard=true` is the
 * explicit escape hatch, and even then the asset rows survive (their
 * `project_id` FK is ON DELETE SET NULL) so no deliverable is ever lost by
 * deleting its project.
 */
export async function DELETE(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { project: ["delete"] });
  if (org instanceof Response) return org;
  const id = context.params.id;
  if (!id) return notFound();

  const db = getDb(context);
  const scoped = and(eq(project.id, id), eq(project.organizationId, org.orgId));

  if (new URL(context.request.url).searchParams.get("hard") === "true") {
    const deleted = await db.delete(project).where(scoped).returning({ id: project.id });
    if (deleted.length === 0) return notFound();
    return apiJson({ ok: true, archived: false });
  }

  const archived = await db
    .update(project)
    .set({ status: "archived", updatedAt: new Date() })
    .where(scoped)
    .returning();

  const row = archived[0];
  if (!row) return notFound();
  return apiJson({ ok: true, archived: true, project: toProjectDto(row, await countAssets(db, id)) });
}
