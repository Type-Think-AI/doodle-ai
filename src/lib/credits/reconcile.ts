/* The hourly reconciliation pass (docs/architecture.md § "Failure modes").
 * Wired to a Cron Trigger once Phase 4 ships — see wrangler.json and the
 * scheduled() handler. Exported as one callable so the trigger, and any
 * future admin "run reconciliation now" action, share one code path.
 */
import { and, eq, lt, sql } from "drizzle-orm";
import { refund } from "./index";
import type { Db } from "../../db/client";
import { creditBalance, creditLedger } from "../../db/schema/billing";
import { generation } from "../../db/schema/product";

const STUCK_PENDING_MINUTES = 10;

export interface ReconcileReport {
  refundedStuckGenerations: number;
  balanceMismatchesRepaired: string[];
  negativeBalances: string[];
}

/**
 * 1. Refund generations that have sat `pending` too long — the Worker that
 *    was supposed to complete them was almost certainly killed mid-flight
 *    (see docs/architecture.md's failure-mode table). The refund reuses
 *    `refund()`, so it's idempotency-keyed exactly like an inline refund
 *    would be and safe to run this pass more than once on the same row.
 * 2. Assert `credit_balance.balance === SUM(credit_ledger.delta)` per user.
 *    The ledger is authoritative; a mismatch means the balance cache is
 *    repaired from it, never the other way around.
 * 3. Flag any negative balance — under the guards in src/lib/credits/index.ts
 *    this should be unreachable, so a hit here means a guard failed
 *    somewhere and is worth paging on, not silently fixing.
 */
export async function reconcile(db: Db): Promise<ReconcileReport> {
  const report: ReconcileReport = {
    refundedStuckGenerations: 0,
    balanceMismatchesRepaired: [],
    negativeBalances: [],
  };

  const cutoff = new Date(Date.now() - STUCK_PENDING_MINUTES * 60 * 1000);
  const stuck = await db
    .select()
    .from(generation)
    .where(and(eq(generation.status, "pending"), lt(generation.createdAt, cutoff)));

  for (const row of stuck) {
    const result = await refund(db, {
      userId: row.userId,
      amount: row.creditsCharged,
      refId: row.id,
      idempotencyKey: `refund:${row.id}`,
    });
    if (result.applied) report.refundedStuckGenerations += 1;
    await db
      .update(generation)
      .set({ status: "refunded", errorCode: "reconcile_stuck_pending", completedAt: new Date() })
      .where(and(eq(generation.id, row.id), eq(generation.status, "pending")));
  }

  const ledgerSums = await db
    .select({ userId: creditLedger.userId, sum: sql<number>`sum(${creditLedger.delta})` })
    .from(creditLedger)
    .groupBy(creditLedger.userId);

  const balances = await db.select().from(creditBalance);
  const balanceByUser = new Map(balances.map((b) => [b.userId, b.balance]));

  for (const { userId, sum } of ledgerSums) {
    const cached = balanceByUser.get(userId) ?? 0;
    if (cached !== sum) {
      await db
        .insert(creditBalance)
        .values({ userId, balance: sum, updatedAt: new Date() })
        .onConflictDoUpdate({ target: creditBalance.userId, set: { balance: sum, updatedAt: new Date() } });
      report.balanceMismatchesRepaired.push(userId);
    }
    if (sum < 0) report.negativeBalances.push(userId);
  }

  // A user with ledger rows but no balance row yet (shouldn't happen —
  // applyDelta always upserts one — but the assertion is cheap and this is
  // exactly the kind of drift reconciliation exists to catch).
  const ledgerUserIds = new Set(ledgerSums.map((r) => r.userId));
  for (const row of balances) {
    if (!ledgerUserIds.has(row.userId) && row.balance !== 0) {
      await db
        .update(creditBalance)
        .set({ balance: 0, updatedAt: new Date() })
        .where(eq(creditBalance.userId, row.userId));
      report.balanceMismatchesRepaired.push(row.userId);
    }
  }

  return report;
}
