/* Better Auth's own tables.
 *
 * PHASE 1 NOTE: these are hand-written to match Better Auth's core schema so
 * the initial migration lands with everything in place. When Better Auth is
 * actually wired up in Phase 2, run `npx @better-auth/cli generate` and
 * reconcile against this file — the CLI is the authority on its own schema,
 * and any plugin we enable (bearer tokens, OAuth) may add columns. After that
 * point, treat this file as generated: do not hand-edit it.
 *
 * Everything else in the schema foreign-keys to `user.id`. Because Better
 * Auth's tables live in *our* D1 database rather than a separate service,
 * those are real foreign keys with real cascade behaviour.
 *
 * TEAM LAYER NOTE (B2B phase): `organization`, `member`, `invitation`, and
 * `session.activeOrganizationId` below were hand-written the same way,
 * against the field set the `organization` plugin (better-auth 1.7.1)
 * actually declares in node_modules/better-auth/dist/plugins/organization/
 * organization.mjs — the CLI could not be run directly against this repo's
 * `createAuth(context)` factory (it needs a request-bound `APIContext` for
 * the D1/KV bindings, which the CLI has no way to supply), so this was
 * copied from the plugin's own schema builder instead of generated. If the
 * CLI is ever made to work here, reconcile against it and prefer its output.
 *
 * `organization.isPersonal` is our own additional field (not part of the
 * plugin's base schema) — see the `organization()` config in
 * src/lib/auth/index.ts for why every user gets exactly one on signup.
 *
 * `member.role` is one of the five roles in src/lib/auth/org-access.ts
 * (owner | producer | artist | reviewer | client), never the plugin's own
 * default "member" literal — every call site that creates a member row
 * passes `role` explicitly.
 */
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    /**
     * The caller's **platform** role — global, cross-organization, and the
     * only thing that grants access to `/admin`.
     *
     * Deliberately NOT called `role`, and deliberately not stored on
     * `member`: `member.role` is the per-organization *team* position
     * (owner | producer | artist | reviewer | client, see
     * src/lib/auth/org-access.ts) and answers a completely different
     * question. The two axes never interact — a platform 'admin' can be a
     * 'client' in someone else's org, and a team 'owner' is still a
     * platform 'user'. Conflating them would either hand every team owner
     * the admin console or make "admin" look like a sixth team role in the
     * access-control statements, which it is not.
     *
     * 'user'    — no /admin access at all; middleware 404s them.
     * 'support' — read-only across every admin screen. Cannot grant
     *             credits and cannot change anyone's role.
     * 'admin'   — full access, including credit grants and promoting or
     *             demoting other admins. Every privileged action lands in
     *             `admin_audit_log`.
     *
     * Better Auth never writes this column (it isn't part of its core user
     * schema and no plugin we enable declares it); it is set only by
     * migrations/0008_seed_first_admin.sql and by
     * PATCH /api/admin/users/:id/role. `input: false` is not expressible
     * here, so the guard against a client ever setting it is that no auth
     * signup path reads it — see src/lib/auth/admin-guard.ts.
     */
    platformRole: text("platform_role").notNull().default("user"),
  },
  (t) => [index("user_platform_role_idx").on(t.platformRole)],
);

/**
 * Every privileged admin action, append-only.
 *
 * An account that can mint credits and promote other admins has to leave a
 * trail — without this, "who granted 5,000 credits to this org last Tuesday"
 * is unanswerable, and `credit_ledger` alone only records that *someone*
 * with admin rights did it. Written in the same request as the action it
 * describes, never updated, never deleted.
 */
export const adminAuditLog = sqliteTable(
  "admin_audit_log",
  {
    id: text("id").primaryKey(),
    /** The admin who performed the action. Never the affected user. */
    actorUserId: text("actor_user_id").notNull(),
    /** Dotted action name: 'credits.grant' | 'user.role.change' | 'skill.state.change' | 'feedback.triage'. */
    action: text("action").notNull(),
    /** 'user' | 'organization' | 'skill' | 'generation' | 'feedback' | null for account-wide actions. */
    targetType: text("target_type"),
    targetId: text("target_id"),
    /** Action-specific payload — the amount granted, the before/after role, etc. */
    detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("audit_actor_created_idx").on(t.actorUserId, t.createdAt),
    index("audit_created_idx").on(t.createdAt),
    index("audit_target_idx").on(t.targetType, t.targetId),
  ],
);

/** The three values `user.platformRole` may hold, most privileged last. */
export const PLATFORM_ROLES = ["user", "support", "admin"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export function isPlatformRole(value: string): value is PlatformRole {
  return (PLATFORM_ROLES as readonly string[]).includes(value);
}

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  /**
   * The organization plugin's own field (`input: false` — never client-set).
   * Stamped by the `databaseHooks.session.create.before` hook in
   * src/lib/auth/index.ts at session creation, which is what makes it
   * available from `getSession()` with `secondaryStorage`'s cookie cache
   * disabled: the value is baked into the session row written to both D1
   * and KV, not recomputed per request.
   */
  activeOrganizationId: text("active_organization_id"),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  /**
   * Required by Better Auth 1.7.1's core account schema. Distinguishes the
   * synthetic namespace a credential came from (`local:email` for
   * email+password, `local:oauth:<provider>` for OAuth) so an account row
   * can never be ambiguous between a local method and a provider of the
   * same name. Better Auth writes this itself via createLocalAccountIssuer /
   * createOAuthAccountIssuer — never set by application code.
   */
  issuer: text("issuer").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * The organization plugin's own tables (B2B team layer). "Organization" here
 * IS the product's "team" — see the vocabulary note at the top of
 * src/lib/auth/org-access.ts before touching any of this.
 */
export const organization = sqliteTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  metadata: text("metadata"),
  /**
   * Our own additional field (not part of the plugin's base schema). Set
   * exactly once, at creation, by the deterministic-id personal org every
   * user gets on signup (src/lib/auth/index.ts) and by the backfill
   * migration for pre-existing users (migrations/0006_backfill_personal_
   * orgs.sql). Never true for an org created through "Create team".
   */
  isPersonal: integer("is_personal", { mode: "boolean" }).notNull().default(false),
});

export const member = sqliteTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull(),
    userId: text("user_id")
      .notNull(),
    /** owner | producer | artist | reviewer | client — see org-access.ts. */
    role: text("role").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("member_organization_idx").on(t.organizationId), index("member_user_idx").on(t.userId)],
);

/**
 * A *targeted* invitation record — who was invited, at what role, by whom.
 * NOT the join mechanism: this product is invite-link-only (no email
 * provider exists), so `auth.api.acceptInvitation` is never called — it
 * hard-rejects any accepting user whose email doesn't match `email` below,
 * which is exactly the case for a forwarded link. `POST /api/v1/join` does
 * the membership insert itself and marks the matching invitation accepted
 * as a courtesy record. See src/pages/api/v1/join.ts.
 */
export const invitation = sqliteTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull(),
    email: text("email").notNull(),
    role: text("role"),
    /** 'pending' | 'accepted' | 'rejected' | 'canceled' */
    status: text("status").notNull().default("pending"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    inviterId: text("inviter_id")
      .notNull(),
  },
  (t) => [index("invitation_organization_idx").on(t.organizationId), index("invitation_email_idx").on(t.email)],
);
