import type { APIContext } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { getDb, withDbSession } from "../../../../../db/client";
import { asset, project } from "../../../../../db/schema/product";
import { apiError, apiJson, requireOrg } from "../../../../../lib/auth/guards";
import { intParam, newId, optStr, readJson, str, toDate } from "../../../../../lib/api/body";
import { isAssetKind, isReviewState, toAssetDto } from "../../../../../lib/api/asset-dto";

export const prerender = false;

const PAGE_DEFAULT = 300;
const PAGE_MAX = 1000;

function notFound(): Response {
  return apiError("not_found", "That project doesn't exist.", 404);
}

/** Confirms the project is this team's before anything reads or writes its assets. */
async function projectExists(db: ReturnType<typeof getDb>, id: string, orgId: string): Promise<boolean> {
  const rows = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, id), eq(project.organizationId, orgId)))
    .limit(1);
  return rows.length > 0;
}

/** GET /api/v1/projects/:id/assets?reviewState=… — newest first. */
export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { asset: ["read"] });
  if (org instanceof Response) return org;
  const id = context.params.id;
  if (!id) return notFound();

  const url = new URL(context.request.url);
  const limit = intParam(url, "limit", PAGE_DEFAULT, PAGE_MAX);
  const reviewStateParam = url.searchParams.get("reviewState");
  if (reviewStateParam && !isReviewState(reviewStateParam)) {
    return apiError("bad_request", "Unknown `reviewState`.", 400);
  }

  const { db, commit } = withDbSession(context);
  if (!(await projectExists(db, id, org.orgId))) return commit(notFound());

  const rows = await db
    .select()
    .from(asset)
    .where(
      and(
        eq(asset.organizationId, org.orgId),
        eq(asset.projectId, id),
        ...(reviewStateParam ? [eq(asset.reviewState, reviewStateParam)] : []),
      ),
    )
    .orderBy(desc(asset.createdAt))
    .limit(limit);

  return commit(apiJson({ assets: rows.map(toAssetDto) }));
}

/**
 * POST /api/v1/projects/:id/assets — add an existing image to the project.
 *
 * This is the *manual* path (attach an upload, or pull an older generation
 * into a project). Fresh generations run through a `projectId` in the chat
 * request and get their asset row written by generate-doodle.ts itself.
 *
 * De-duplicated on `unique(organizationId, url)` exactly as
 * /api/v1/moodboard's POST is: re-adding the same image is a no-op that
 * returns the existing row, not a second row or a 409. If the existing row
 * sits in a different project, it is re-pointed at this one — the same
 * image can only be in one project at a time by construction.
 */
export async function POST(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { asset: ["create"] });
  if (org instanceof Response) return org;
  const id = context.params.id;
  if (!id) return notFound();

  const body = await readJson(context.request);
  const url = body ? str(body.url) : null;
  if (!url) return apiError("bad_request", "`url` is required.", 400);
  const kind = body?.kind ?? "upload";
  if (!isAssetKind(kind)) return apiError("bad_request", "`kind` must be generation, reference or upload.", 400);

  const db = getDb(context);
  if (!(await projectExists(db, id, org.orgId))) return notFound();

  const existing = await db
    .select()
    .from(asset)
    .where(and(eq(asset.organizationId, org.orgId), eq(asset.url, url)))
    .limit(1);

  const already = existing[0];
  if (already) {
    if (already.projectId === id) return apiJson({ asset: toAssetDto(already) });
    const moved = await db
      .update(asset)
      .set({ projectId: id })
      .where(and(eq(asset.id, already.id), eq(asset.organizationId, org.orgId)))
      .returning();
    return apiJson({ asset: toAssetDto(moved[0] ?? already) });
  }

  const values = {
    id: optStr(body?.id) ?? newId(),
    organizationId: org.orgId,
    projectId: id,
    url,
    kind,
    generationId: optStr(body?.generationId),
    name: optStr(body?.name),
    reviewState: "draft",
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    createdBy: org.user.id,
    createdAt: toDate(body?.createdAt, Date.now()),
  } satisfies typeof asset.$inferInsert;

  await db.insert(asset).values(values).onConflictDoNothing({ target: asset.id });

  return apiJson({ asset: toAssetDto(values) }, 201);
}
