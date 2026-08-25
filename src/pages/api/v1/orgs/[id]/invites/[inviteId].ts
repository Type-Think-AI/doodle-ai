import type { APIContext } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db/client";
import { invitation } from "../../../../../../db/schema/auth";
import { apiError, apiJson } from "../../../../../../lib/auth/guards";
import { requireOrgById } from "../../../../../../lib/org/route";

export const prerender = false;

/**
 * DELETE /api/v1/orgs/:id/invites/:inviteId — cancel a pending invitation.
 *
 * Marks the row `canceled` rather than deleting it, so the member list keeps
 * an honest record of who was invited and what happened to it. The
 * `i-<invitationId>` link (see index.ts / join.ts) stops resolving the
 * instant this lands, since GET /join/:token checks `status === 'pending'`.
 */
export async function DELETE(context: APIContext): Promise<Response> {
  const org = await requireOrgById(context, context.params.id, { invitation: ["cancel"] });
  if (org instanceof Response) return org;

  const inviteId = context.params.inviteId;
  if (!inviteId) return apiError("bad_request", "Missing invite id.", 400);

  const db = getDb(context);
  const updated = await db
    .update(invitation)
    .set({ status: "canceled" })
    .where(and(eq(invitation.id, inviteId), eq(invitation.organizationId, org.orgId), eq(invitation.status, "pending")))
    .returning({ id: invitation.id });

  if (updated.length === 0) return apiError("not_found", "That invite isn't pending.", 404);
  return apiJson({ canceled: inviteId });
}
