import type { APIContext } from "astro";
import { and, asc, eq } from "drizzle-orm";
import { createAuth } from "./index";
import { getDb } from "../../db/client";
import { member, organization } from "../../db/schema/auth";
import { type OrgRole, roles } from "./org-access";

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  emailVerified: boolean;
}

interface SessionResolved {
  user: AuthedUser;
  activeOrganizationId: string | null;
}

/**
 * Resolve the caller, or null if unauthenticated.
 *
 * Better Auth's `getSession` reads the session cookie *and* the
 * `Authorization: Bearer` header (via the bearer plugin), so web and mobile
 * clients both land here with no branching at the call site. That is the
 * whole reason the plugin is enabled in Phase 2 — see docs/mobile-strategy.md.
 */
async function resolveSession(context: APIContext): Promise<SessionResolved | null> {
  try {
    const auth = await createAuth(context);
    const session = await auth.api.getSession({ headers: context.request.headers });
    if (!session?.user) return null;
    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
        emailVerified: session.user.emailVerified,
      },
      // Cast: this field exists on the session row (src/db/schema/auth.ts,
      // stamped by the databaseHooks.session.create.before hook in
      // src/lib/auth/index.ts) but isn't threaded through Better Auth's own
      // inferred session type unless the client-side $Infer types are used.
      activeOrganizationId:
        (session.session as unknown as { activeOrganizationId?: string | null }).activeOrganizationId ?? null,
    };
  } catch {
    // A malformed or expired credential is not an error worth surfacing —
    // it is simply an unauthenticated request. Genuine misconfiguration
    // (missing bindings/secret) throws from createAuth on every request and
    // will be obvious immediately.
    return null;
  }
}

export async function optionalAuth(context: APIContext): Promise<AuthedUser | null> {
  const resolved = await resolveSession(context);
  return resolved?.user ?? null;
}

/**
 * Resolve the caller, or return a 401 to send straight back.
 *
 *   const result = await requireAuth(context);
 *   if (result instanceof Response) return result;
 *   const user = result;
 */
export async function requireAuth(context: APIContext): Promise<AuthedUser | Response> {
  const user = await optionalAuth(context);
  if (user) return user;
  return apiError("unauthenticated", "You need to be signed in to do that.", 401);
}

export interface OrgContext {
  user: AuthedUser;
  orgId: string;
  role: OrgRole;
}

type PermissionCheck = Parameters<(typeof roles)["owner"]["authorize"]>[0];

/**
 * Resolve the caller AND their active organization, checking membership and
 * (optionally) a permission on that membership's role — the one guard every
 * team-scoped route should use instead of `requireAuth`.
 *
 *   const result = await requireOrg(context, { project: ["create"] });
 *   if (result instanceof Response) return result;
 *   const { user, orgId, role } = result;
 *
 * Resolution order, each falling through to the next:
 *   1. `requireAuth` — 401 if not signed in at all.
 *   2. An explicit override: `X-Doodle-Org` header, then `?orgId=`, then a
 *      JSON body `orgId` field. Needed because a write queued client-side
 *      before an org switch can drain after it lands (see api-client.ts) —
 *      the request must be able to say which org it was queued for rather
 *      than trusting whatever the session resolves to *now*.
 *   3. `session.activeOrganizationId`, stamped at sign-in.
 *   4. The caller's oldest membership row.
 *   5. Self-heal: no membership at all means the signup hook's personal-org
 *      creation and the one-time backfill migration both somehow missed
 *      this user (see the deploy-gap note in migrations/0006_backfill_
 *      personal_orgs.sql) — create `org_<uid>` / `mem_<uid>` right now,
 *      idempotently, and continue. A user should never see a hard failure
 *      here; the whole point of that migration's design is that this path
 *      is the last-resort backstop, not the common case.
 *
 * The membership row is always re-read from D1 even when the session cache
 * already names an org — the session field is a cache of "which org was
 * active at sign-in", not an authority on "is this user still a member". A
 * member removed from an org must lose access on their very next request,
 * not whenever their 30-day session happens to refresh.
 */
export async function requireOrg(
  context: APIContext,
  permission?: PermissionCheck,
): Promise<OrgContext | Response> {
  const resolved = await resolveSession(context);
  if (!resolved) return apiError("unauthenticated", "You need to be signed in to do that.", 401);
  const { user } = resolved;

  const db = getDb(context);
  const requestedOrgId = await readOrgOverride(context);
  const candidateOrgId = requestedOrgId ?? resolved.activeOrganizationId ?? undefined;

  let membership: { organizationId: string; role: string } | undefined;

  if (candidateOrgId) {
    const rows = await db
      .select({ organizationId: member.organizationId, role: member.role })
      .from(member)
      .where(and(eq(member.userId, user.id), eq(member.organizationId, candidateOrgId)))
      .limit(1);
    membership = rows[0];
    if (requestedOrgId && !membership) {
      return apiError("forbidden", "You're not a member of that team.", 403);
    }
  }

  if (!membership) {
    const rows = await db
      .select({ organizationId: member.organizationId, role: member.role })
      .from(member)
      .where(eq(member.userId, user.id))
      .orderBy(asc(member.createdAt))
      .limit(1);
    membership = rows[0];
  }

  if (!membership) {
    membership = await selfHealPersonalOrg(db, user);
  }

  if (!isOrgRoleValue(membership.role)) {
    // A member row with a role outside our five is a data bug (every write
    // path passes one explicitly), not a normal permission denial — fail
    // loudly rather than silently granting the wrong access.
    throw new Error(`Member row for user ${user.id} in org ${membership.organizationId} has unknown role "${membership.role}".`);
  }

  if (permission) {
    const check = roles[membership.role].authorize(permission);
    if (!check.success) {
      return apiError("forbidden", "Your role doesn't allow that.", 403, {
        role: membership.role,
        required: permission,
      });
    }
  }

  return { user, orgId: membership.organizationId, role: membership.role };
}

async function readOrgOverride(context: APIContext): Promise<string | undefined> {
  const header = context.request.headers.get("X-Doodle-Org");
  if (header) return header;
  const url = new URL(context.request.url);
  const fromQuery = url.searchParams.get("orgId");
  if (fromQuery) return fromQuery;
  // Only GET/HEAD-safe to skip body reads; POST/PATCH/DELETE routes that
  // want body-based override read `orgId` themselves before calling
  // requireOrg and pass it via the header instead, so the body stream is
  // never consumed twice. Documented at each such call site.
  return undefined;
}

/**
 * No membership anywhere — create this user's personal org right now,
 * idempotently, with the same deterministic ids the signup hook
 * (src/lib/auth/index.ts) and the backfill migration
 * (migrations/0006_backfill_personal_orgs.sql) both use, so all three can
 * never disagree about what that org's id is.
 */
async function selfHealPersonalOrg(
  db: ReturnType<typeof getDb>,
  user: AuthedUser,
): Promise<{ organizationId: string; role: string }> {
  const orgId = `org_${user.id}`;
  const now = new Date();
  await db.batch([
    db
      .insert(organization)
      .values({
        id: orgId,
        name: `${user.name || user.email}'s Team`,
        slug: `u-${user.id}`,
        logo: user.image ?? null,
        createdAt: now,
        isPersonal: true,
      })
      .onConflictDoNothing(),
    db
      .insert(member)
      .values({ id: `mem_${user.id}`, organizationId: orgId, userId: user.id, role: "owner", createdAt: now })
      .onConflictDoNothing(),
  ]);
  return { organizationId: orgId, role: "owner" };
}

function isOrgRoleValue(value: string): value is OrgRole {
  return value === "owner" || value === "producer" || value === "artist" || value === "reviewer" || value === "client";
}

/**
 * The uniform error envelope from docs/architecture.md § "API surface".
 * Both the web and the future mobile client map on `code`, never on the
 * human-readable `message`.
 */
export function apiError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify({ error: { code, message, ...(details ? { details } : {}) } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function apiJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
