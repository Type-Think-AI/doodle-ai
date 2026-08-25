import type { APIContext } from "astro";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../../../db/client";
import { member } from "../../../../../../db/schema/auth";
import { apiError, apiJson } from "../../../../../../lib/auth/guards";
import { isOrgRole } from "../../../../../../lib/auth/org-access";
import { optStr, readJson } from "../../../../../../lib/api/body";
import { requireOrgById } from "../../../../../../lib/org/route";

export const prerender = false;

/**
 * PATCH /api/v1/orgs/:id/members/:memberId — change a member's role.
 *
 * Refuses to demote the last owner: an org with no owner has nobody who can
 * invite, delete it, or move its credits, and there is no admin surface to
 * repair that from.
 */
export async function PATCH(context: APIContext): Promise<Response> {
  const org = await requireOrgById(context, context.params.id, { member: ["update"] });
  if (org instanceof Response) return org;

  const memberId = context.params.memberId;
  if (!memberId) return apiError("bad_request", "Missing member id.", 400);

  const body = (await readJson(context.request)) ?? {};
  const role = optStr(body.role);
  if (!role || !isOrgRole(role)) return apiError("bad_request", "Unknown role.", 400);

  const db = getDb(context);
  const target = await findMember(db, org.orgId, memberId);
  if (!target) return apiError("not_found", "That person isn't in this team.", 404);

  if (target.role === "owner" && role !== "owner") {
    const owners = await countOwners(db, org.orgId);
    if (owners <= 1) return apiError("last_owner", "A team needs at least one owner.", 409);
  }

  await db.update(member).set({ role }).where(eq(member.id, memberId));
  return apiJson({ member: { id: memberId, userId: target.userId, role } });
}

/**
 * DELETE /api/v1/orgs/:id/members/:memberId — remove a member, or leave.
 *
 * Removing yourself is always allowed regardless of role — that is the
 * "leave team" action, and it would be perverse to require `member:delete`
 * on your own membership. The last-owner rule still applies: the last owner
 * cannot leave a team they'd be stranding.
 */
export async function DELETE(context: APIContext): Promise<Response> {
  const memberId = context.params.memberId;
  if (!memberId) return apiError("bad_request", "Missing member id.", 400);

  // Membership-only first, so a client/reviewer leaving isn't blocked by the
  // `member:delete` permission they don't have.
  const asMember = await requireOrgById(context, context.params.id);
  if (asMember instanceof Response) return asMember;

  const db = getDb(context);
  const target = await findMember(db, asMember.orgId, memberId);
  if (!target) return apiError("not_found", "That person isn't in this team.", 404);

  const isSelf = target.userId === asMember.user.id;
  if (!isSelf) {
    const privileged = await requireOrgById(context, context.params.id, { member: ["delete"] });
    if (privileged instanceof Response) return privileged;
  }

  if (target.role === "owner") {
    const owners = await countOwners(db, asMember.orgId);
    if (owners <= 1) {
      return apiError(
        "last_owner",
        isSelf
          ? "You're the last owner — hand ownership over before leaving."
          : "A team needs at least one owner.",
        409,
      );
    }
  }

  await db.delete(member).where(eq(member.id, memberId));
  return apiJson({ removed: memberId, left: isSelf });
}

async function findMember(
  db: ReturnType<typeof getDb>,
  orgId: string,
  memberId: string,
): Promise<{ userId: string; role: string } | undefined> {
  const rows = await db
    .select({ userId: member.userId, role: member.role })
    .from(member)
    .where(and(eq(member.id, memberId), eq(member.organizationId, orgId)))
    .limit(1);
  return rows[0];
}

async function countOwners(db: ReturnType<typeof getDb>, orgId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.role, "owner")));
  return Number(rows[0]?.count ?? 0);
}
