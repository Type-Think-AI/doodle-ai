/* Credits, purchases and subscriptions.
 *
 * The design rationale for all of this — why the ledger is append-only, why
 * every write carries an idempotency key, and why the read-then-write in the
 * spend path is safe on D1 but *not* on Postgres — lives in
 * docs/architecture.md § "The credit ledger". Read it before changing
 * anything here; this is the part of the schema where a bug costs money.
 */
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization, user } from "./auth";

/**
 * The authoritative record of every credit movement. Append-only: business
 * logic never UPDATEs or DELETEs a row here, it appends a signed `delta`.
 *
 * `idempotencyKey` is UNIQUE at the database level, so a retried Stripe
 * webhook, a double-clicked buy button, or a client retrying a dropped
 * generation all collide on the constraint rather than double-counting. See
 * docs/architecture.md for how the key is constructed per event type.
 *
 * B2B TEAM LAYER NOTE: credits are now org-owned (`organizationId`), not
 * user-owned. `userId` is kept and repurposed as **the acting member** — who
 * actually ran the generation or triggered the grant — never renamed,
 * because every historical row already has an actor and per-member spend
 * reporting (`GET /api/v1/credits/by-member`) reads directly off it.
 * `organizationId` is nullable only because it was added after `userId`
 * existed on every historical row (see migrations/0006_backfill_personal_
 * orgs.sql, which fills every row's organizationId from `'org_'||userId`);
 * every row written by application code always sets it. `credit_balance`
 * below (the old per-user cache) is dual-written for one release after this
 * change ships and then dropped — see credit_balance_org.
 */
export const creditLedger = sqliteTable(
  "credit_ledger",
  {
    id: text("id").primaryKey(),
    /** The acting member. See the file header — this is not the org owner. */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Nullable only for the historical-row reason above; always set going forward. */
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    /** Signed: positive for grants/purchases/refunds, negative for spend. */
    delta: integer("delta").notNull(),
    /** 'signup_grant' | 'purchase' | 'subscription_grant' | 'generation' | 'refund' | 'admin_adjustment' | 'transfer_in' | 'transfer_out' */
    reason: text("reason").notNull(),
    /** generation.id, purchase.id, a Stripe event id, or a transfer id, depending on `reason`. */
    refId: text("ref_id"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    /** Balance snapshot after this row was applied — for audit and cheap reconciliation. */
    balanceAfter: integer("balance_after").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("ledger_user_created_idx").on(t.userId, t.createdAt),
    index("ledger_org_created_idx").on(t.organizationId, t.createdAt),
    index("ledger_org_actor_created_idx").on(t.organizationId, t.userId, t.createdAt),
  ],
);

/**
 * The legacy per-user balance cache. Superseded by `creditBalanceOrg` below.
 * Kept and dual-written for one release after the org-credits migration
 * ships, purely as a rollback safety net, then dropped in a later cleanup
 * migration. Do not read from this table in new code — read
 * `creditBalanceOrg`.
 */
export const creditBalance = sqliteTable("credit_balance", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * The org-owned balance cache — the shared team credit pool. Never
 * authoritative; SUM(credit_ledger.delta) grouped by organizationId is, and
 * `reconcile.ts`'s hourly sweep rebuilds this from that sum if the two ever
 * disagree. `credit_balance.userId` was the PK on the old table and cannot
 * be repointed at an org without a full table rebuild (D1/SQLite can't
 * alter a primary key) — that's why this is a new table, not a migration of
 * the old one.
 */
export const creditBalanceOrg = sqliteTable("credit_balance_org", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Per-org overrides for generation rate limits and monthly spend caps. */
export const orgLimits = sqliteTable("org_limits", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  /** No cap when null. Checked in src/mastra/tools/generate-doodle.ts before every spend. */
  monthlyCreditCap: integer("monthly_credit_cap"),
  perMemberDailyCap: integer("per_member_daily_cap"),
  generationsPerMinute: integer("generations_per_minute").notNull().default(40),
});

/**
 * A reusable, revocable "Paste your invite link to join" link — the primary
 * join mechanism for this product (no email provider exists; see
 * src/pages/api/v1/join.ts for why this bypasses the org plugin's own
 * accept-invitation endpoint).
 */
export const orgInviteLink = sqliteTable(
  "org_invite_link",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    /** owner | producer | artist | reviewer | client — capped below owner at creation time. */
    role: text("role").notNull(),
    maxUses: integer("max_uses"),
    uses: integer("uses").notNull().default(0),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("org_invite_link_org_idx").on(t.organizationId)],
);

export const stripeCustomer = sqliteTable("stripe_customer", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const purchase = sqliteTable("purchase", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  packId: text("pack_id").notNull(),
  credits: integer("credits").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  /** 'pending' | 'paid' | 'refunded' | 'failed' */
  status: text("status").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const subscription = sqliteTable("subscription", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
  priceId: text("price_id").notNull(),
  /** Stripe's subscription status, stored verbatim. */
  status: text("status").notNull(),
  monthlyCredits: integer("monthly_credits").notNull(),
  currentPeriodEnd: integer("current_period_end", { mode: "timestamp_ms" }).notNull(),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" }).notNull().default(false),
});

/**
 * Stripe webhook replay guard. Stripe retries deliveries, so this is the
 * second of two independent defences against double-crediting (the first
 * being creditLedger.idempotencyKey).
 */
export const webhookEvent = sqliteTable("webhook_event", {
  stripeEventId: text("stripe_event_id").primaryKey(),
  type: text("type").notNull(),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }).notNull(),
});
