import type { APIContext } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { asset, shareLink } from "../../../../../db/schema/product";
import { apiError, apiJson, requireOrg } from "../../../../../lib/auth/guards";
import { newId, readJson } from "../../../../../lib/api/body";
import { expiryFromDays, newShareToken, toShareLinkDto } from "../../../../../lib/api/share";

export const prerender = false;

/** POST /api/v1/assets/:id/share — a single-image review link. */
export async function POST(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { share: ["create"] });
  if (org instanceof Response) return org;
  const id = context.params.id;
  if (!id) return apiError("not_found", "That asset doesn't exist.", 404);

  const db = getDb(context);
  const owned = await db
    .select({ id: asset.id })
    .from(asset)
    .where(and(eq(asset.id, id), eq(asset.organizationId, org.orgId)))
    .limit(1);
  if (owned.length === 0) return apiError("not_found", "That asset doesn't exist.", 404);

  const body = await readJson(context.request);
  const values = {
    id: newId(),
    token: newShareToken(),
    organizationId: org.orgId,
    projectId: null,
    assetId: id,
    scope: "asset",
    allowComments: body?.allowComments === true,
    expiresAt: expiryFromDays(body?.expiresInDays),
    revokedAt: null,
    boardId: null,
    createdBy: org.user.id,
    createdAt: new Date(),
  } satisfies typeof shareLink.$inferInsert;

  await db.insert(shareLink).values(values);

  return apiJson({ link: toShareLinkDto(values, new URL(context.request.url).origin) }, 201);
}
