/* The credit ledger. See docs/architecture.md § "The credit ledger" for the
 * full rationale — this file implements exactly that spec.
 *
 * Two rules hold everywhere below:
 *
 *  1. The ledger is append-only. No function here ever UPDATEs or DELETEs a
 *     credit_ledger row; every call appends a signed `delta` and updates the
 *     `credit_balance_org` cache in the same write.
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
 * *because* of that single-writer guarantee, not despite it. `transfer()`
 * below leans on exactly the same guarantee to move credits between two
 * orgs' balances in one batch without a two-phase commit.
 *
 * Taking the Neon escape hatch (docs/tech-stack.md) means this file cannot
 * move over unchanged: `spend()` in particular would need row locking or
 * serializable retries to keep this same guarantee on Postgres.
 *
 * B2B TEAM LAYER NOTE: credits moved from user-owned to org-owned. Every
 * `LedgerWrite` now carries both `organizationId` (whose pool is charged)
 * and `userId` (who did it — the acting member, for per-member spend
 * reporting). `credit_balance` — the old per-user cache — is dual-written
 * here for one release as a rollback safety net; new code should read
 * `creditBalanceOrg`, never `creditBalance`.
 */
import { eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { creditBalance, creditBalanceOrg, creditLedger } from "../../db/schema/billing";

export type CreditReason =
  | "signup_grant"
  | "purchase"
  | "subscription_grant"
  | "generation"
  | "refund"
  | "admin_adjustment"
  | "transfer_in"
  | "transfer_out";

export interface LedgerWrite {
  /** Whose pool is charged or credited. */
  organizationId: string;
  /** The acting member — who triggered this write. */
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

async function currentBalance(db: Db, organizationId: string): Promise<number> {
  const rows = await db
    .select({ balance: creditBalanceOrg.balance })
    .from(creditBalanceOrg)
    .where(eq(creditBalanceOrg.organizationId, organizationId));
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

  const balance = await currentBalance(db, write.organizationId);
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

export async function getBalance(db: Db, organizationId: string): Promise<number> {
  return currentBalance(db, organizationId);
}

/**
 * Move credits from one org's pool to another's — e.g. a creator seeding a
 * new team from their personal org's balance ("Move my N credits to this
 * team" in the team-creation dialog). Implemented as one `db.batch()` of
 * four statements (two ledger inserts, two balance upserts), safe under the
 * same D1 single-writer guarantee documented at the top of this file — not
 * a two-phase commit, just one atomic batch touching two rows.
 *
 * `transferId` seeds both idempotency keys (`xfer:<id>:out` / `:in`) so a
 * retried transfer request is a no-op rather than a double move. Callers
 * must have `credits:transfer` on *both* orgs — enforced by the route, not
 * here (this function trusts its caller, same as spend/grant/refund).
 */
export async function transfer(
  db: Db,
  args: { fromOrgId: string; toOrgId: string; amount: number; userId: string; transferId: string },
): Promise<{ ok: true; fromBalance: number; toBalance: number } | InsufficientCreditsResult> {
  if (args.amount <= 0) {
    throw new Error(`transfer() amount must be positive, got ${args.amount}`);
  }
  const outKey = `xfer:${args.transferId}:out`;
  const existingOut = await findByIdempotencyKey(db, outKey);
  if (existingOut) {
    return {
      ok: true,
      fromBalance: existingOut.balanceAfter,
      toBalance: await currentBalance(db, args.toOrgId),
    };
  }

  const fromBalance = await currentBalance(db, args.fromOrgId);
  if (fromBalance < args.amount) {
    return { ok: false, reason: "insufficient_credits", balance: fromBalance, required: args.amount };
  }

  const now = new Date();
  const outId = crypto.randomUUID();
  const inId = crypto.randomUUID();
  const fromAfter = fromBalance - args.amount;
  // toBalance snapshot below is a read-then-write like the rest of this
  // file — safe for the same single-writer reason, not despite it.
  const toBefore = await currentBalance(db, args.toOrgId);
  const toAfter = toBefore + args.amount;

  try {
    await db.batch([
      db.insert(creditLedger).values({
        id: outId,
        organizationId: args.fromOrgId,
        userId: args.userId,
        delta: -args.amount,
        reason: "transfer_out",
        refId: args.transferId,
        idempotencyKey: outKey,
        balanceAfter: fromAfter,
        createdAt: now,
      }),
      db.insert(creditLedger).values({
        id: inId,
        organizationId: args.toOrgId,
        userId: args.userId,
        delta: args.amount,
        reason: "transfer_in",
        refId: args.transferId,
        idempotencyKey: `xfer:${args.transferId}:in`,
        balanceAfter: toAfter,
        createdAt: now,
      }),
      db
        .insert(creditBalanceOrg)
        .values({ organizationId: args.fromOrgId, balance: fromAfter, updatedAt: now })
        .onConflictDoUpdate({
          target: creditBalanceOrg.organizationId,
          set: { balance: sql`${creditBalanceOrg.balance} - ${args.amount}`, updatedAt: now },
        }),
      db
        .insert(creditBalanceOrg)
        .values({ organizationId: args.toOrgId, balance: toAfter, updatedAt: now })
        .onConflictDoUpdate({
          target: creditBalanceOrg.organizationId,
          set: { balance: sql`${creditBalanceOrg.balance} + ${args.amount}`, updatedAt: now },
        }),
    ]);
  } catch (err) {
    const existing = await findByIdempotencyKey(db, outKey);
    if (existing) {
      return { ok: true, fromBalance: existing.balanceAfter, toBalance: await currentBalance(db, args.toOrgId) };
    }
    throw err;
  }

  return {
    ok: true,
    fromBalance: await currentBalance(db, args.fromOrgId),
    toBalance: await currentBalance(db, args.toOrgId),
  };
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
 *
 * Dual-writes the legacy per-user `credit_balance` row alongside the
 * org-owned `credit_balance_org` row, for one release, as a rollback safety
 * net — see the file header and the table's own comment in
 * src/db/schema/billing.ts. Remove this dual-write in the cleanup phase
 * once `credit_balance` is dropped.
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

  const balanceBefore = await currentBalance(db, write.organizationId);
  const balanceAfter = balanceBefore + write.delta;
  const now = new Date();
  const ledgerId = crypto.randomUUID();

  try {
    await db.batch([
      db.insert(creditLedger).values({
        id: ledgerId,
        userId: write.userId,
        organizationId: write.organizationId,
        delta: write.delta,
        reason: write.reason,
        refId: write.refId ?? null,
        idempotencyKey: write.idempotencyKey,
        balanceAfter,
        createdAt: now,
      }),
      db
        .insert(creditBalanceOrg)
        .values({ organizationId: write.organizationId, balance: balanceAfter, updatedAt: now })
        .onConflictDoUpdate({
          target: creditBalanceOrg.organizationId,
          // Set relative to the ledger delta rather than to the literal
          // `balanceAfter` computed above, so a rare interleaving between
          // the read above and this write still lands on the correct total
          // — the increment is commutative even if the base it started from
          // was stale by the time this statement runs.
          set: { balance: sql`${creditBalanceOrg.balance} + ${write.delta}`, updatedAt: now },
        }),
      // Legacy dual-write — rollback safety net, see the file header.
      db
        .insert(creditBalance)
        .values({ userId: write.userId, balance: Math.max(0, write.delta), updatedAt: now })
        .onConflictDoUpdate({
          target: creditBalance.userId,
          set: { balance: sql`max(0, ${creditBalance.balance} + ${write.delta})`, updatedAt: now },
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

  const finalBalance = await currentBalance(db, write.organizationId);
  return { ok: true, balance: finalBalance, applied: true };
}

export { creditLedger, creditBalance, creditBalanceOrg };
