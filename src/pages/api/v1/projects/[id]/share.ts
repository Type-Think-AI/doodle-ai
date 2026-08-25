import type { APIContext } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { project, shareLink } from "../../../../../db/schema/product";
import { apiError, apiJson, requireOrg } from "../../../../../lib/auth/guards";
import { newId, readJson } from "../../../../../lib/api/body";
import { expiryFromDays, newShareToken, toShareLinkDto } from "../../../../../lib/api/share";

export const prerender = false;

/**
 * POST /api/v1/projects/:id/share — mint a client review link.
 *
 * Every call mints a *new* token rather than returning an existing one, so
 * "revoke and re-share" is always available and one leaked link never has to
 * be the team's only link. The public GET side is
 * src/pages/api/share/[token].ts.
 */
export async function POST(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { share: ["create"] });
  if (org instanceof Response) return org;
  const id = context.params.id;
  if (!id) return apiError("not_found", "That project doesn't exist.", 404);

  const db = getDb(context);
  const owned = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, id), eq(project.organizationId, org.orgId)))
    .limit(1);
  if (owned.length === 0) return apiError("not_found", "That project doesn't exist.", 404);

  const body = await readJson(context.request);
  const values = {
    id: newId(),
    token: newShareToken(),
    organizationId: org.orgId,
    projectId: id,
    assetId: null,
    scope: "project",
    allowComments: body?.allowComments === true,
    expiresAt: expiryFromDays(body?.expiresInDays),
    revokedAt: null,
    createdBy: org.user.id,
    createdAt: new Date(),
  } satisfies typeof shareLink.$inferInsert;

  await db.insert(shareLink).values(values);

  return apiJson({ link: toShareLinkDto(values, new URL(context.request.url).origin) }, 201);
}
