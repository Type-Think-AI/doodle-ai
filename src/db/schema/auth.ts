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
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
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
