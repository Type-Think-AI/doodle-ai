/* Platform-role access control for /admin and /api/admin.
 *
 * This is the *platform* axis: global, cross-organization, and completely
 * separate from `requireOrg()` in ./guards.ts, which resolves a team
 * membership and its five team roles. Nothing here consults `member` at all.
 * See the doc comment on `user.platformRole` in src/db/schema/auth.ts.
 *
 * Every function returns either the resolved context or a `Response` to send
 * straight back, matching the convention `requireAuth`/`requireOrg` already
 * use so admin call sites read identically to the rest of the API:
 *
 *   const result = await requireAdmin(context);
 *   if (result instanceof Response) return result;
 *   const { user, platformRole } = result;
 */
import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { isPlatformRole, type PlatformRole, user as userTable } from "../../db/schema/auth";
import { type AuthedUser, apiError, optionalAuth } from "./guards";
import { readSecret, type SecretLike } from "../secrets";

export interface AdminContext {
  user: AuthedUser;
  platformRole: PlatformRole;
  /** True when access came from ADMIN_BOOTSTRAP_EMAIL rather than the database. */
  viaBootstrap: boolean;
}

/** Ordered least- to most-privileged, so a numeric comparison expresses "at least". */
const RANK: Record<PlatformRole, number> = { user: 0, support: 1, admin: 2 };

/**
 * Resolve the caller's platform role, or null if they aren't signed in.
 *
 * The role is always re-read from D1 rather than taken from the session:
 * `platform_role` is not a Better Auth session field, and even if it were
 * cached there, demoting an admin has to take effect on their next request
 * rather than whenever their 30-day session happens to refresh. That is the
 * same argument `requireOrg()` makes for re-reading the membership row.
 */
export async function resolvePlatformRole(
  context: APIContext,
): Promise<{ user: AuthedUser; platformRole: PlatformRole; viaBootstrap: boolean } | null> {
  const authed = await optionalAuth(context);
  if (!authed) return null;

  const db = getDb(context);
  const rows = await db
    .select({ platformRole: userTable.platformRole })
    .from(userTable)
    .where(eq(userTable.id, authed.id))
    .limit(1);

  const stored = rows[0]?.platformRole ?? "user";
  let platformRole: PlatformRole = isPlatformRole(stored) ? stored : "user";
  let viaBootstrap = false;

  // Recovery hatch. If 0008_seed_first_admin.sql matched zero rows (the
  // account hadn't signed up yet when migrations ran) there is no in-product
  // way to grant the first admin, because granting requires being one. This
  // secret closes that loop without a second migration.
  //
  // It is a Worker secret, not a public env var, and it only ever *raises*
  // the role — it can never lock someone out. Deliberately logged on every
  // use: a bootstrap grant is an exceptional event and should be visible in
  // Workers logs, not silent.
  if (platformRole !== "admin") {
    const bootstrapEmail = await readBootstrapEmail(context);
    if (bootstrapEmail && bootstrapEmail.toLowerCase() === authed.email.toLowerCase()) {
      platformRole = "admin";
      viaBootstrap = true;
      console.warn(
        `[admin-guard] Granted admin to ${authed.email} via ADMIN_BOOTSTRAP_EMAIL; ` +
          `database platform_role is "${stored}". Promote this account properly and unset the secret.`,
      );
    }
  }

  return { user: authed, platformRole, viaBootstrap };
}

async function readBootstrapEmail(context: APIContext): Promise<string | undefined> {
  // The binding is optional — its absence is the normal, healthy state, so
  // this reads through the runtime env rather than assuming the key exists.
  // `readSecret` accepts either a plain string (`.dev.vars`) or a Secrets
  // Store binding, and never throws.
  const runtimeEnv = (context.locals as { runtime?: { env?: Record<string, SecretLike> } })?.runtime
    ?.env;
  if (!runtimeEnv) return undefined;
  return readSecret(runtimeEnv.ADMIN_BOOTSTRAP_EMAIL, "ADMIN_BOOTSTRAP_EMAIL");
}

/**
 * Require at least `minimum`. 'support' passes a 'support' requirement and an
 * 'admin' passes both, so read-only endpoints ask for 'support' and every
 * mutating one asks for 'admin'.
 */
export async function requirePlatformRole(
  context: APIContext,
  minimum: PlatformRole = "support",
): Promise<AdminContext | Response> {
  const resolved = await resolvePlatformRole(context);

  if (!resolved || RANK[resolved.platformRole] < RANK[minimum]) {
    // 403, not a 404, on the API: a signed-in non-admin hitting an admin
    // endpoint is a real authorization failure the client should surface.
    // The *page* routes 404 instead — that decision lives in
    // src/middleware.ts, which does not want to confirm /admin exists.
    if (!resolved) {
      return apiError("unauthenticated", "You need to be signed in to do that.", 401);
    }
    return apiError("forbidden", "This action requires platform admin access.", 403, {
      required: minimum,
    });
  }

  return resolved;
}

/** Full admin — credit grants, role changes, anything that mutates. */
export async function requireAdmin(context: APIContext): Promise<AdminContext | Response> {
  return requirePlatformRole(context, "admin");
}

/** Read-only admin surfaces. Satisfied by 'support' or 'admin'. */
export async function requireAdminRead(context: APIContext): Promise<AdminContext | Response> {
  return requirePlatformRole(context, "support");
}

/** True when this role may see /admin at all. Used by middleware and the layout. */
export function canViewAdmin(role: PlatformRole): boolean {
  return RANK[role] >= RANK.support;
}

/** True when this role may perform mutating admin actions. Drives UI disabled states. */
export function canMutateAdmin(role: PlatformRole): boolean {
  return RANK[role] >= RANK.admin;
}
