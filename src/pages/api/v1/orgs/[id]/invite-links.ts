import type { APIContext } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { orgInviteLink } from "../../../../../db/schema/billing";
import { apiError, apiJson } from "../../../../../lib/auth/guards";
import { isOrgRole } from "../../../../../lib/auth/org-access";
import { newId, optStr, readJson } from "../../../../../lib/api/body";
import { newShareToken } from "../../../../../lib/api/share";
import { originOf, requireOrgById } from "../../../../../lib/org/route";
import type { InviteLinkDto, OrgRole } from "../../../../../lib/api/dto";

export const prerender = false;

const MAX_EXPIRY_DAYS = 90;

function toInviteLinkDto(row: typeof orgInviteLink.$inferSelect, origin: string): InviteLinkDto {
  return {
    id: row.id,
    url: `${origin}/join/${row.token}`,
    role: row.role as OrgRole,
    maxUses: row.maxUses,
    uses: row.uses,
    expiresAt: row.expiresAt?.getTime() ?? null,
    revokedAt: row.revokedAt?.getTime() ?? null,
    createdAt: row.createdAt.getTime(),
  };
}

/** GET /api/v1/orgs/:id/invite-links — every link ever minted for this team, active or not. */
export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrgById(context, context.params.id);
  if (org instanceof Response) return org;

  const db = getDb(context);
  const rows = await db.select().from(orgInviteLink).where(eq(orgInviteLink.organizationId, org.orgId));
  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const origin = originOf(context);
  return apiJson({ links: rows.map((r: typeof orgInviteLink.$inferSelect) => toInviteLinkDto(r, origin)) });
}

/**
 * POST /api/v1/orgs/:id/invite-links — "Paste your invite link to join your
 * new team" — mints a reusable, revocable link. `role` is capped below
 * owner: link possession is the entire credential (no email channel to carry
 * a second factor — see src/pages/api/v1/join.ts), so a link can never hand
 * out ownership by itself.
 */
export async function POST(context: APIContext): Promise<Response> {
  const org = await requireOrgById(context, context.params.id, { invitation: ["create"] });
  if (org instanceof Response) return org;

  const body = (await readJson(context.request)) ?? {};
  const role = optStr(body.role) ?? "artist";
  if (!isOrgRole(role) || role === "owner") return apiError("bad_request", "Pick a role below owner.", 400);

  const maxUses =
    typeof body.maxUses === "number" && Number.isFinite(body.maxUses) && body.maxUses > 0
      ? Math.floor(body.maxUses)
      : null;
  const expiresInDays =
    typeof body.expiresInDays === "number" && Number.isFinite(body.expiresInDays) && body.expiresInDays > 0
      ? Math.min(Math.floor(body.expiresInDays), MAX_EXPIRY_DAYS)
      : 14;

  const now = new Date();
  const values = {
    id: newId(),
    organizationId: org.orgId,
    token: newShareToken(),
    role,
    maxUses,
    uses: 0,
    expiresAt: new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000),
    revokedAt: null,
    createdBy: org.user.id,
    createdAt: now,
  } satisfies typeof orgInviteLink.$inferInsert;

  const db = getDb(context);
  await db.insert(orgInviteLink).values(values);

  return apiJson({ link: toInviteLinkDto(values, originOf(context)) }, 201);
}

/** DELETE /api/v1/orgs/:id/invite-links?linkId=... — revoke. */
export async function DELETE(context: APIContext): Promise<Response> {
  const org = await requireOrgById(context, context.params.id, { invitation: ["cancel"] });
  if (org instanceof Response) return org;

  const linkId = new URL(context.request.url).searchParams.get("linkId");
  if (!linkId) return apiError("bad_request", "Missing `linkId`.", 400);

  const db = getDb(context);
  const revoked = await db
    .update(orgInviteLink)
    .set({ revokedAt: new Date() })
    .where(and(eq(orgInviteLink.id, linkId), eq(orgInviteLink.organizationId, org.orgId)))
    .returning({ id: orgInviteLink.id });

  if (revoked.length === 0) return apiError("not_found", "That link doesn't exist.", 404);
  return apiJson({ ok: true });
}
