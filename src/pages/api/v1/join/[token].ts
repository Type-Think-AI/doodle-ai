/* GET|POST /api/v1/join/[token]
 *
 * The actual join mechanism for this product — see the vocabulary note in
 * src/lib/auth/org-access.ts and the deviation documented on
 * `auth.api.acceptInvitation` below. Two token shapes share this one route:
 *
 *   - `i-<invitationId>` — a *targeted* invite created by
 *     POST /orgs/:id/invites (an email address was recorded against it).
 *   - a bare token — a reusable link minted by
 *     POST /orgs/:id/invite-links.
 *
 * Both resolve through the same preview/accept pair rather than through
 * `auth.api.acceptInvitation`: that endpoint hard-rejects any accepting user
 * whose email doesn't match the invitation's `email` field (better-auth
 * 1.7.1, plugins/organization/routes/crud-invites.mjs) — which is exactly
 * what happens when a targeted invite is forwarded, and always happens for
 * a reusable link (it was never addressed to one email in the first place).
 * This route does the membership insert itself and only touches the
 * `invitation` row as a courtesy status update.
 */
import type { APIContext } from "astro";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db/client";
import { invitation, member, organization } from "../../../../db/schema/auth";
import { orgInviteLink } from "../../../../db/schema/billing";
import { apiError, apiJson, requireAuth } from "../../../../lib/auth/guards";
import { createAuth } from "../../../../lib/auth";
import { isOrgRole } from "../../../../lib/auth/org-access";
import { kvIncrement } from "../../../../lib/kv-counter";

export const prerender = false;

const PREVIEWS_PER_MINUTE = 30;
/** Better Auth's own `membershipLimit` (src/lib/auth/index.ts) — checked here too, before the insert. */
const MEMBERSHIP_LIMIT = 25;

interface Resolved {
  organizationId: string;
  role: string;
  valid: boolean;
  reason?: "not_found" | "expired" | "revoked" | "used_up" | "already_member";
  /** Present only for a targeted invitation — used to mark it accepted. */
  invitationId?: string;
  /** Present only for a reusable link — used to bump its use count. */
  linkId?: string;
}

async function resolveToken(
  db: ReturnType<typeof getDb>,
  token: string,
  forUserId?: string,
): Promise<Resolved | null> {
  if (token.startsWith("i-")) {
    const id = token.slice(2);
    const rows = await db.select().from(invitation).where(eq(invitation.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;
    if (row.status !== "pending") return { organizationId: row.organizationId, role: row.role ?? "artist", valid: false, reason: "expired" };
    if (row.expiresAt.getTime() <= Date.now()) return { organizationId: row.organizationId, role: row.role ?? "artist", valid: false, reason: "expired" };
    return { organizationId: row.organizationId, role: row.role ?? "artist", valid: true, invitationId: row.id };
  }

  const rows = await db.select().from(orgInviteLink).where(eq(orgInviteLink.token, token)).limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.revokedAt) return { organizationId: row.organizationId, role: row.role, valid: false, reason: "revoked" };
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    return { organizationId: row.organizationId, role: row.role, valid: false, reason: "expired" };
  }
  if (row.maxUses !== null && row.uses >= row.maxUses) {
    return { organizationId: row.organizationId, role: row.role, valid: false, reason: "used_up" };
  }
  if (forUserId) {
    const existing = await db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, row.organizationId), eq(member.userId, forUserId)))
      .limit(1);
    if (existing[0]) return { organizationId: row.organizationId, role: row.role, valid: false, reason: "already_member" };
  }
  return { organizationId: row.organizationId, role: row.role, valid: true, linkId: row.id };
}

/**
 * GET /api/v1/join/:token — UNAUTHENTICATED preview.
 *
 * Shown before sign-in so `/join/[token]` can render "You've been invited to
 * join Acme" without forcing a login first. Rate-limited by IP for the same
 * enumeration-oracle reason as GET /api/share/:token.
 */
export async function GET(context: APIContext): Promise<Response> {
  const token = context.params.token;
  if (!token) return apiError("bad_request", "Missing token.", 400);

  const env = (context.locals as { runtime?: { env?: Env } })?.runtime?.env;
  const sessions = env?.SESSIONS;
  if (sessions) {
    const ip = context.request.headers.get("CF-Connecting-IP") ?? "unknown";
    const bucket = Math.floor(Date.now() / 60_000);
    const count = await kvIncrement(sessions, `ratelimit:join-preview:${ip}:${bucket}`, 90);
    if (count > PREVIEWS_PER_MINUTE) return apiError("rate_limited", "Too many requests — try again in a moment.", 429);
  }

  const db = getDb(context);
  const resolved = await resolveToken(db, token);
  if (!resolved) return apiJson({ valid: false, reason: "not_found" });
  if (!resolved.valid) return apiJson({ valid: false, reason: resolved.reason });

  const orgs = await db
    .select({ name: organization.name, logo: organization.logo })
    .from(organization)
    .where(eq(organization.id, resolved.organizationId))
    .limit(1);
  const org = orgs[0];
  if (!org) return apiJson({ valid: false, reason: "not_found" });

  return apiJson({
    valid: true,
    orgName: org.name,
    orgLogo: org.logo,
    role: resolved.role,
  });
}

/**
 * POST /api/v1/join — `{ token }`. Requires auth. Does the membership insert
 * itself; see the file header for why this never calls
 * `auth.api.acceptInvitation`.
 */
export async function POST(context: APIContext): Promise<Response> {
  const user = await requireAuth(context);
  if (user instanceof Response) return user;

  const body = (await context.request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : null;
  if (!token) return apiError("bad_request", "Missing `token`.", 400);

  const db = getDb(context);
  const resolved = await resolveToken(db, token, user.id);
  if (!resolved) return apiError("not_found", "That invite link isn't valid.", 404);
  if (!resolved.valid) {
    if (resolved.reason === "already_member") {
      // Not an error — switch them into the team they're already in.
    } else {
      return apiError("invite_invalid", inviteInvalidMessage(resolved.reason), 410);
    }
  }

  if (!isOrgRole(resolved.role)) {
    return apiError("invite_invalid", "That invite's role is no longer valid.", 410);
  }

  const memberRows = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, resolved.organizationId), eq(member.userId, user.id)))
    .limit(1);

  if (!memberRows[0]) {
    const countRows = await db
      .select({ id: member.id })
      .from(member)
      .where(eq(member.organizationId, resolved.organizationId));
    if (countRows.length >= MEMBERSHIP_LIMIT) {
      return apiError("team_full", "This team is already at its member limit.", 409);
    }

    const now = new Date();
    // Two separate writes rather than one heterogeneous `db.batch()` array:
    // Drizzle's D1 batch signature wants a same-shaped tuple, and the
    // second write here (the invitation/link courtesy update) is optional
    // and varies by which token shape resolved. The member insert is the
    // one write that must land for the join to mean anything; if the
    // isolate died between these two statements, the courtesy status
    // update is just stale bookkeeping — not a security or credit issue —
    // and the next resolveToken() call for the same link naturally
    // tolerates an under-counted `uses`.
    await db.insert(member).values({
      id: `mem_${resolved.organizationId}_${user.id}`,
      organizationId: resolved.organizationId,
      userId: user.id,
      role: resolved.role,
      createdAt: now,
    }).onConflictDoNothing();

    if (resolved.invitationId) {
      await db
        .update(invitation)
        .set({ status: "accepted" })
        .where(and(eq(invitation.id, resolved.invitationId), eq(invitation.status, "pending")));
    }
    if (resolved.linkId) {
      await db
        .update(orgInviteLink)
        .set({ uses: sql`${orgInviteLink.uses} + 1` })
        .where(eq(orgInviteLink.id, resolved.linkId));
    }
  }

  const auth = createAuth(context);
  try {
    await auth.api.setActiveOrganization({
      body: { organizationId: resolved.organizationId },
      headers: context.request.headers,
    });
  } catch {
    // Membership is what matters; failing to also flip the active org is
    // recoverable from the switcher.
  }

  const orgs = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, resolved.organizationId))
    .limit(1);

  return apiJson({ organizationId: resolved.organizationId, orgName: orgs[0]?.name ?? "" }, memberRows[0] ? 200 : 201);
}

function inviteInvalidMessage(reason: Resolved["reason"]): string {
  switch (reason) {
    case "expired":
      return "That invite has expired.";
    case "revoked":
      return "That invite link was revoked.";
    case "used_up":
      return "That invite link has already been used.";
    default:
      return "That invite link isn't valid.";
  }
}
