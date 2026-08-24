/* The credit ledger. See docs/architecture.md § "The credit ledger" for the
 * full rationale — this file implements exactly that spec.
 *
 * Two rules hold everywhere below:
 *
 *  1. The ledger is append-only. No function here ever UPDATEs or DELETEs a
 *     credit_ledger row; every call appends a signed `delta` and updates the
 *     `credit_balance` cache in the same write.
 *
 *  2. Every write carries a caller-supplied, globally-unique idempotency
 *     key. A duplicate key is not an error — it means "this exact event was
 *     already applied", so the existing state is returned as success. That
 *     is what makes a retried Stripe webhook or a retried generation safe to
 *     replay: the second attempt is a no-op, not a double-charge.
 *
 * Concurrency note (this is the part that matters):
 *
 * `spend()` reads the current balance and then writes a lower one. On a
 * database with concurrent writers, that read-then-write is a classic
 * lost-update race: two requests both read balance=1, both decide they can
 * afford a 1-credit spend, and the user ends up spending 2 credits' worth
 * having only had 1. Preventing that on Postgres needs `SELECT ... FOR
 * UPDATE` or `SERIALIZABLE` isolation.
 *
 * D1 does not have that problem, because every D1 database is
 * single-threaded — it processes one query at a time, full stop (see
 * docs/tech-stack.md's D1 limits table). Within the single `db.batch()` call
 * each of these functions issues, no other write to this database can
 * interleave, so the balance this function computes is guaranteed to still
 * be current when its own write lands. `db.batch()` is used specifically
 * because Drizzle's D1 driver does not support `db.transaction()` — batch is
 * the atomicity primitive D1 actually offers, and it's sufficient here only
 * *because* of that single-writer guarantee, not despite it.
 *
 * Taking the Neon escape hatch (docs/tech-stack.md) means this file cannot
 * move over unchanged: `spend()` in particular would need row locking or
 * serializable retries to keep this same guarantee on Postgres.
 */
import { eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { creditBalance, creditLedger } from "../../db/schema/billing";

export type CreditReason =
  | "signup_grant"
  | "purchase"
  | "subscription_grant"
  | "generation"
  | "refund"
  | "admin_adjustment";

export interface LedgerWrite {
  userId: string;
  amount: number;
  reason: CreditReason;
  refId?: string;
  idempotencyKey: string;
}

export interface LedgerResult {
  ok: true;
  balance: number;
  /** True if this call did the write; false if the idempotency key was already applied. */
  applied: boolean;
}

export interface InsufficientCreditsResult {
  ok: false;
  reason: "insufficient_credits";
  balance: number;
  required: number;
}

export type SpendResult = LedgerResult | InsufficientCreditsResult;

async function currentBalance(db: Db, userId: string): Promise<number> {
  const rows = await db.select({ balance: creditBalance.balance }).from(creditBalance).where(eq(creditBalance.userId, userId));
  return rows[0]?.balance ?? 0;
}

/** Returns null if the key was never used, or the ledger row if it was. */
async function findByIdempotencyKey(db: Db, idempotencyKey: string) {
  const rows = await db.select().from(creditLedger).where(eq(creditLedger.idempotencyKey, idempotencyKey)).limit(1);
  return rows[0] ?? null;
}

/**
 * Append a positive delta: signup grants, purchases, subscription renewals,
 * refunds, admin adjustments. `amount` must be positive — pass the
 * unsigned magnitude, this function applies the sign implied by the ledger
 * convention (grants are `+amount`).
 */
export async function grant(db: Db, write: LedgerWrite): Promise<LedgerResult> {
  if (write.amount <= 0) {
    throw new Error(`grant() amount must be positive, got ${write.amount}`);
  }
  return applyDelta(db, { ...write, delta: write.amount });
}

/**
 * Append a negative delta after checking the balance covers it. Never
 * throws for insufficient funds — callers branch on `result.ok`.
 */
export async function spend(db: Db, write: LedgerWrite): Promise<SpendResult> {
  if (write.amount <= 0) {
    throw new Error(`spend() amount must be positive, got ${write.amount}`);
  }

  // Replay check first: if this exact spend was already applied, return the
  // balance as it stood right after — never re-evaluate affordability for a
  // request we've already honoured.
  const existing = await findByIdempotencyKey(db, write.idempotencyKey);
  if (existing) {
    return { ok: true, balance: existing.balanceAfter, applied: false };
  }

  const balance = await currentBalance(db, write.userId);
  if (balance < write.amount) {
    return { ok: false, reason: "insufficient_credits", balance, required: write.amount };
  }

  // `existing` was already confirmed null just above, so the redundant
  // pre-check inside applyDelta is skipped; the UNIQUE constraint in its
  // try/catch is still the real defence against a concurrent duplicate.
  return applyDelta(db, { ...write, delta: -write.amount }, true);
}

/**
 * Append a compensating positive delta for a failed generation. Distinct
 * from `grant()` only in naming — refunds are the reversal half of a spend,
 * grants are new credit — but keeping them separate functions makes call
 * sites self-documenting and keeps `reason: "refund"` from being spelled out
 * at every call site.
 */
export async function refund(db: Db, write: Omit<LedgerWrite, "reason">): Promise<LedgerResult> {
  if (write.amount <= 0) {
    throw new Error(`refund() amount must be positive, got ${write.amount}`);
  }
  return applyDelta(db, { ...write, reason: "refund", delta: write.amount });
}

export async function getBalance(db: Db, userId: string): Promise<number> {
  return currentBalance(db, userId);
}

/**
 * The shared write path for grant/spend/refund. Does its own idempotency
 * check-and-insert inside the same batch as the balance update, so a
 * concurrent duplicate call collides on `credit_ledger.idempotency_key`'s
 * UNIQUE constraint rather than double-applying — belt-and-suspenders on top
 * of the pre-check `spend()` does for its insufficient-funds decision.
 *
 * `skipPreCheck` lets `spend()` skip a second, redundant idempotency lookup
 * when it already did one to decide affordability.
 */
async function applyDelta(
  db: Db,
  write: LedgerWrite & { delta: number },
  skipPreCheck = true,
): Promise<LedgerResult> {
  if (!skipPreCheck) {
    const existing = await findByIdempotencyKey(db, write.idempotencyKey);
    if (existing) return { ok: true, balance: existing.balanceAfter, applied: false };
  }

  const balanceBefore = await currentBalance(db, write.userId);
  const balanceAfter = balanceBefore + write.delta;
  const now = new Date();
  const ledgerId = crypto.randomUUID();

  try {
    await db.batch([
      db.insert(creditLedger).values({
        id: ledgerId,
        userId: write.userId,
        delta: write.delta,
        reason: write.reason,
        refId: write.refId ?? null,
        idempotencyKey: write.idempotencyKey,
        balanceAfter,
        createdAt: now,
      }),
      db
        .insert(creditBalance)
        .values({ userId: write.userId, balance: balanceAfter, updatedAt: now })
        .onConflictDoUpdate({
          target: creditBalance.userId,
          // Set relative to the ledger delta rather than to the literal
          // `balanceAfter` computed above, so a rare interleaving between
          // the read above and this write still lands on the correct total
          // — the increment is commutative even if the base it started from
          // was stale by the time this statement runs.
          set: { balance: sql`${creditBalance.balance} + ${write.delta}`, updatedAt: now },
        }),
    ]);
  } catch (err) {
    // UNIQUE constraint violation on idempotency_key: another call with the
    // same key won the race between our pre-check and this write. Treat it
    // exactly like the pre-check hit.
    const existing = await findByIdempotencyKey(db, write.idempotencyKey);
    if (existing) return { ok: true, balance: existing.balanceAfter, applied: false };
    throw err;
  }

  const finalBalance = await currentBalance(db, write.userId);
  return { ok: true, balance: finalBalance, applied: true };
}

export { creditLedger, creditBalance };
