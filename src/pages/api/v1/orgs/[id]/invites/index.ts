import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../db/client";
import { invitation } from "../../../../../../db/schema/auth";
import { apiError, apiJson } from "../../../../../../lib/auth/guards";
import { safeError } from "../../../../../../lib/http/errors";
import { createAuth } from "../../../../../../lib/auth";
import { isOrgRole } from "../../../../../../lib/auth/org-access";
import { optStr, readJson } from "../../../../../../lib/api/body";
import { originOf, requireOrgById } from "../../../../../../lib/org/route";
import type { InvitationDto, OrgRole } from "../../../../../../lib/api/dto";

export const prerender = false;

function toInvitationDto(row: typeof invitation.$inferSelect, inviteUrl?: string): InvitationDto {
  return {
    id: row.id,
    email: row.email,
    role: (row.role && isOrgRole(row.role) ? row.role : "artist") as OrgRole,
    status: row.status as InvitationDto["status"],
    ...(inviteUrl ? { inviteUrl } : {}),
    createdAt: row.createdAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
  };
}

/**
 * GET /api/v1/orgs/:id/invites — pending + resolved targeted invitations.
 *
 * This is the record of who was invited at what role, not the join
 * mechanism — see src/pages/api/v1/join.ts for why joining never calls
 * `auth.api.acceptInvitation`.
 */
export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrgById(context, context.params.id);
  if (org instanceof Response) return org;

  const db = getDb(context);
  const rows = await db.select().from(invitation).where(eq(invitation.organizationId, org.orgId));
  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return apiJson({ invitations: rows.map((r) => toInvitationDto(r)) });
}

/**
 * POST /api/v1/orgs/:id/invites — "Invite your teammates" (email row).
 *
 * There is no email provider wired up (see docs/architecture.md and the
 * plan's §3 "Invites" note), so this creates the record — a name/role the
 * member table can show as "invited" — and hands back a copyable link built
 * the same way `POST /invite-links` does: `i-<invitationId>` rather than a
 * reusable token, so it resolves through the one join flow
 * (`GET /join/:token`, `POST /api/v1/join`) and is capped at a single use by
 * the invitation's own `status` transition. The UI is expected to show
 * "Email delivery isn't live yet — copy this link and send it yourself."
 * next to the created row, per the plan.
 */
export async function POST(context: APIContext): Promise<Response> {
  const org = await requireOrgById(context, context.params.id, { invitation: ["create"] });
  if (org instanceof Response) return org;

  const body = (await readJson(context.request)) ?? {};
  const email = optStr(body.email)?.toLowerCase();
  const role = optStr(body.role);
  if (!email || !email.includes("@")) return apiError("bad_request", "That doesn't look like an email address.", 400);
  if (!role || !isOrgRole(role) || role === "owner") {
    return apiError("bad_request", "Pick a role below owner.", 400);
  }

  const auth = await createAuth(context);
  let createdId: string | null;
  try {
    const created = (await auth.api.createInvitation({
      body: { email, role, organizationId: org.orgId, resend: true },
      headers: context.request.headers,
    })) as { id?: string } | null;
    createdId = created?.id ?? null;
  } catch (err) {
    // Same reasoning as POST /api/v1/orgs: Better Auth's message would land
    // verbatim in the invite dialog. Log it, answer with our own wording.
    return safeError("POST /api/v1/orgs/:id/invites", err, {
      code: "invite_failed",
      message: "Couldn't create that invite.",
      status: 400,
    });
  }
  if (!createdId) return apiError("invite_failed", "Couldn't create that invite.", 500);

  const rows = await getDb(context).select().from(invitation).where(eq(invitation.id, createdId)).limit(1);
  const row = rows[0];
  if (!row) return apiError("invite_failed", "Couldn't create that invite.", 500);

  const inviteUrl = `${originOf(context)}/join/i-${row.id}`;
  return apiJson({ invitation: toInvitationDto(row, inviteUrl) }, 201);
}

/** Re-exported so [inviteId].ts's cancel route shares the same DTO shape. */
export { toInvitationDto };
