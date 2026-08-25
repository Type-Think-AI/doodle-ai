/* The hourly reconciliation pass (docs/architecture.md § "Failure modes").
 * Wired to a Cron Trigger once Phase 4 ships — see wrangler.json and the
 * scheduled() handler. Exported as one callable so the trigger, and any
 * future admin "run reconciliation now" action, share one code path.
 *
 * B2B TEAM LAYER NOTE: balance reconciliation now groups by organizationId
 * and repairs `credit_balance_org`, not the legacy per-user `credit_balance`
 * (still dual-written by src/lib/credits/index.ts as a rollback safety net,
 * but no longer authoritative for anything). Three new sweeps guard the
 * "nullable forever" org-scoping columns documented in src/db/schema/
 * product.ts and billing.ts — every one of them should find nothing, and a
 * non-empty result here is a real bug to chase, not routine drift.
 */
import { and, eq, isNull, lt, notExists, sql } from "drizzle-orm";
import { refund } from "./index";
import type { Db } from "../../db/client";
import { creditBalanceOrg, creditLedger } from "../../db/schema/billing";
import { batchItem, generation } from "../../db/schema/product";
import { member, user } from "../../db/schema/auth";

const STUCK_PENDING_MINUTES = 10;
const STUCK_BATCH_ITEM_MINUTES = 10;

export interface ReconcileReport {
  refundedStuckGenerations: number;
  balanceMismatchesRepaired: string[];
  negativeBalances: string[];
  /** Ledger rows still missing organizationId — a bug, see the file header. */
  orphanLedgerRows: number;
  /** Users with zero memberships anywhere — requireOrg() self-heals these live, but they shouldn't accumulate. */
  usersWithNoMembership: number;
  /** batch_item rows stuck 'running' too long — resumed/refunded by src/lib/batch/sweep.ts, just counted here for visibility. */
  stuckBatchItems: number;
}

/**
 * 1. Refund generations that have sat `pending` too long — the Worker that
 *    was supposed to complete them was almost certainly killed mid-flight
 *    (see docs/architecture.md's failure-mode table). The refund reuses
 *    `refund()`, so it's idempotency-keyed exactly like an inline refund
 *    would be and safe to run this pass more than once on the same row.
 * 2. Assert `credit_balance_org.balance === SUM(credit_ledger.delta)` per
 *    org. The ledger is authoritative; a mismatch means the balance cache
 *    is repaired from it, never the other way around.
 * 3. Flag any negative balance — under the guards in src/lib/credits/index.ts
 *    this should be unreachable, so a hit here means a guard failed
 *    somewhere and is worth paging on, not silently fixing.
 * 4. Count (don't fix) rows that violate the "every write sets
 *    organizationId" invariant — see src/db/schema/product.ts's file header
 *    for why those columns are nullable forever and enforced only in code.
 */
export async function reconcile(db: Db): Promise<ReconcileReport> {
  const report: ReconcileReport = {
    refundedStuckGenerations: 0,
    balanceMismatchesRepaired: [],
    negativeBalances: [],
    orphanLedgerRows: 0,
    usersWithNoMembership: 0,
    stuckBatchItems: 0,
  };

  const cutoff = new Date(Date.now() - STUCK_PENDING_MINUTES * 60 * 1000);
  const stuck = await db
    .select()
    .from(generation)
    .where(and(eq(generation.status, "pending"), lt(generation.createdAt, cutoff)));

  for (const row of stuck) {
    if (!row.organizationId) {
      // Can't refund what has no pool to refund into — flag and skip; the
      // orphan-ledger-row count below will also catch this generation's
      // spend if it's similarly unscoped.
      continue;
    }
    const result = await refund(db, {
      organizationId: row.organizationId,
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
    .select({ organizationId: creditLedger.organizationId, sum: sql<number>`sum(${creditLedger.delta})` })
    .from(creditLedger)
    .where(sql`${creditLedger.organizationId} is not null`)
    .groupBy(creditLedger.organizationId);

  const balances = await db.select().from(creditBalanceOrg);
  const balanceByOrg = new Map(balances.map((b) => [b.organizationId, b.balance]));

  for (const { organizationId, sum } of ledgerSums) {
    if (!organizationId) continue;
    const cached = balanceByOrg.get(organizationId) ?? 0;
    if (cached !== sum) {
      await db
        .insert(creditBalanceOrg)
        .values({ organizationId, balance: sum, updatedAt: new Date() })
        .onConflictDoUpdate({ target: creditBalanceOrg.organizationId, set: { balance: sum, updatedAt: new Date() } });
      report.balanceMismatchesRepaired.push(organizationId);
    }
    if (sum < 0) report.negativeBalances.push(organizationId);
  }

  // An org with ledger rows but no balance row yet (shouldn't happen —
  // applyDelta always upserts one — but the assertion is cheap and this is
  // exactly the kind of drift reconciliation exists to catch).
  const ledgerOrgIds = new Set(ledgerSums.map((r) => r.organizationId));
  for (const row of balances) {
    if (!ledgerOrgIds.has(row.organizationId) && row.balance !== 0) {
      await db
        .update(creditBalanceOrg)
        .set({ balance: 0, updatedAt: new Date() })
        .where(eq(creditBalanceOrg.organizationId, row.organizationId));
      report.balanceMismatchesRepaired.push(row.organizationId);
    }
  }

  const orphanLedger = await db
    .select({ id: creditLedger.id })
    .from(creditLedger)
    .where(isNull(creditLedger.organizationId));
  report.orphanLedgerRows = orphanLedger.length;

  const usersWithoutMembership = await db
    .select({ id: user.id })
    .from(user)
    .where(
      notExists(
        db
          .select({ one: sql`1` })
          .from(member)
          .where(eq(member.userId, user.id)),
      ),
    );
  report.usersWithNoMembership = usersWithoutMembership.length;

  const batchCutoff = new Date(Date.now() - STUCK_BATCH_ITEM_MINUTES * 60 * 1000);
  const stuckItems = await db
    .select({ id: batchItem.id })
    .from(batchItem)
    .where(and(eq(batchItem.status, "running"), lt(batchItem.createdAt, batchCutoff)));
  report.stuckBatchItems = stuckItems.length;

  return report;
}
