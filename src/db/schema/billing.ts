/* Credits, purchases and subscriptions.
 *
 * The design rationale for all of this — why the ledger is append-only, why
 * every write carries an idempotency key, and why the read-then-write in the
 * spend path is safe on D1 but *not* on Postgres — lives in
 * docs/architecture.md § "The credit ledger". Read it before changing
 * anything here; this is the part of the schema where a bug costs money.
 */
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

/**
 * The authoritative record of every credit movement. Append-only: business
 * logic never UPDATEs or DELETEs a row here, it appends a signed `delta`.
 *
 * `idempotencyKey` is UNIQUE at the database level, so a retried Stripe
 * webhook, a double-clicked buy button, or a client retrying a dropped
 * generation all collide on the constraint rather than double-counting. See
 * docs/architecture.md for how the key is constructed per event type.
 */
export const creditLedger = sqliteTable(
  "credit_ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Signed: positive for grants/purchases/refunds, negative for spend. */
    delta: integer("delta").notNull(),
    /** 'signup_grant' | 'purchase' | 'subscription_grant' | 'generation' | 'refund' | 'admin_adjustment' */
    reason: text("reason").notNull(),
    /** generation.id, purchase.id, or a Stripe event id, depending on `reason`. */
    refId: text("ref_id"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    /** Balance snapshot after this row was applied — for audit and cheap reconciliation. */
    balanceAfter: integer("balance_after").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("ledger_user_created_idx").on(t.userId, t.createdAt)],
);

/**
 * A cache of SUM(credit_ledger.delta) per user, updated in the same
 * transaction as the ledger append. Never authoritative — if it ever
 * disagrees with the ledger, the ledger wins and this gets rebuilt (the
 * hourly reconciliation job in Phase 4 does exactly that).
 */
export const creditBalance = sqliteTable("credit_balance", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

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
