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
import { and, eq, isNull, lt, notExists, or, sql } from "drizzle-orm";
import { refund } from "./index";
import type { Db } from "../../db/client";
import { creditBalanceOrg, creditLedger } from "../../db/schema/billing";
import { batchItem, generation } from "../../db/schema/product";
import { member, user } from "../../db/schema/auth";
import { VIDEO_TIMEOUT_MINUTES } from "../video/constants";

/**
 * How long a `pending` generation may sit before this pass treats it as a dead
 * Worker and refunds it. This is NOT one number, and shortening it blindly
 * re-opens a real double-refund — read this before you touch either value.
 *
 * The window means opposite things for the two kinds:
 *
 *  - kind='image' (STUCK_PENDING_MINUTES): an image render takes seconds. The
 *    row is written `pending` right before PicX is called and flipped `ok`/
 *    `failed` on the same request. If it is still `pending` after 10 minutes
 *    the isolate that owned it was evicted mid-flight and nothing will ever
 *    complete it, so refunding is correct and 10 minutes is generous.
 *
 *  - kind='video' (VIDEO_TIMEOUT_MINUTES): a video submit returns IMMEDIATELY
 *    with a PicX generation id, then legitimately stays `pending` for MINUTES
 *    while the provider renders and until the async webhook (POST
 *    /api/webhooks/picx) arrives to complete it. 480p/5s lands in 40-90s, but a
 *    15s clip under load has been seen past 4 minutes. If this pass refunded a
 *    clip at the image's 10-minute mark while it was still rendering, the
 *    webhook would then complete it as `ok` — the user would keep the video AND
 *    get the credits back, and the ledger would disagree with reality. That is
 *    the double-refund this split exists to prevent. VIDEO_TIMEOUT_MINUTES
 *    lives in src/lib/video/constants.ts (the single source of truth for the
 *    render budget, quoted here rather than re-declared) and must stay clear of
 *    the longest real render, not the average one.
 *
 * A row with kind NULL is treated as an image: pre-migration-0016 rows have no
 * kind and their behaviour must not change.
 */
const STUCK_PENDING_MINUTES = 10;
const STUCK_BATCH_ITEM_MINUTES = 10;

export interface ReconcileReport {
  /** Stuck-pending IMAGE generations refunded (dead-Worker window, 10 min). */
  refundedStuckGenerations: number;
  /**
   * Stuck-pending VIDEO generations refunded (render-budget window,
   * VIDEO_TIMEOUT_MINUTES). Reported separately from the image count so a clip
   * timing out is visible on its own rather than hidden inside the image number
   * — a non-zero value here means either a genuinely dead render or a webhook
   * that never arrived, both worth chasing.
   */
  refundedStuckVideoGenerations: number;
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
 * 1. Refund generations that have sat `pending` too long. What "too long"
 *    means is KIND-AWARE (see STUCK_PENDING_MINUTES above): an image past 10
 *    minutes is a Worker killed mid-flight, a video past VIDEO_TIMEOUT_MINUTES
 *    is a render that never came back. Refunding a video at the image window
 *    would double-refund a clip the webhook then completes. The refund reuses
 *    `refund()` with the same `refund:<id>` idempotency key the webhook uses,
 *    so this pass, a late webhook, and a re-run all collapse onto one ledger
 *    row and are safe to repeat on the same row.
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
    refundedStuckVideoGenerations: 0,
    balanceMismatchesRepaired: [],
    negativeBalances: [],
    orphanLedgerRows: 0,
    usersWithNoMembership: 0,
    stuckBatchItems: 0,
  };

  // Kind-aware stuck-pending sweep. Two windows, because a `pending` image and
  // a `pending` video mean different things (see STUCK_PENDING_MINUTES). A row
  // with kind NULL (pre-0016) is an image, so the image predicate matches it.
  const now = Date.now();
  const imageCutoff = new Date(now - STUCK_PENDING_MINUTES * 60 * 1000);
  const videoCutoff = new Date(now - VIDEO_TIMEOUT_MINUTES * 60 * 1000);

  const stuck = await db
    .select()
    .from(generation)
    .where(
      and(
        eq(generation.status, "pending"),
        or(
          // Images (and NULL-kind legacy rows) past the short dead-Worker window.
          and(
            or(eq(generation.kind, "image"), isNull(generation.kind)),
            lt(generation.createdAt, imageCutoff),
          ),
          // Videos past the long render-budget window.
          and(eq(generation.kind, "video"), lt(generation.createdAt, videoCutoff)),
        ),
      ),
    );

  for (const row of stuck) {
    if (!row.organizationId) {
      // Can't refund what has no pool to refund into — flag and skip; the
      // orphan-ledger-row count below will also catch this generation's
      // spend if it's similarly unscoped.
      continue;
    }
    const isVideo = row.kind === "video";
    const result = await refund(db, {
      organizationId: row.organizationId,
      userId: row.userId,
      amount: row.creditsCharged,
      refId: row.id,
      idempotencyKey: `refund:${row.id}`,
    });
    if (result.applied) {
      if (isVideo) report.refundedStuckVideoGenerations += 1;
      else report.refundedStuckGenerations += 1;
    }
    await db
      .update(generation)
      .set({
        status: "refunded",
        errorCode: isVideo ? "reconcile_stuck_pending_video" : "reconcile_stuck_pending",
        completedAt: new Date(),
      })
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
