/* The safety net under `ctx.waitUntil` fan-out — run hourly from
 * src-worker/entry.ts's scheduled() handler, alongside reconcile().
 *
 * `runBatch` is best-effort by construction: an evicted isolate stops
 * mid-flight and nothing re-drives it. Two kinds of wreckage can be left
 * behind, and this pass is the only thing that clears either:
 *
 *   1. An item stuck 'running' — claimed, then abandoned before its PicX
 *      call returned. Its share of the job's up-front credit reservation is
 *      still held.
 *   2. A job stuck 'running' whose items are all terminal — the final
 *      status flip at the end of runBatch never got to execute, so the
 *      client polls a job that will never say it finished.
 *
 * Stuck items are refunded, not resumed. Resuming would mean re-issuing the
 * PicX call from a cron isolate with no request context, and the item may
 * well have succeeded upstream after we lost track of it — paying for an
 * image nobody can see is bad, but paying twice and showing one is worse.
 * A clean refund leaves the team's balance exactly where it should be and
 * the failed item visible in the batch, which is a state the UI already
 * renders. The credit is returned through the *same* idempotency key
 * runBatch would have used, so a sweep racing a late-but-alive isolate
 * cannot double-refund.
 *
 * Note that reconcile.ts's `stuckBatchItems` field counts these same rows.
 * That count is an observability signal only; this function is what fixes
 * them.
 */
import { and, eq, lt } from "drizzle-orm";
import type { Db } from "../../db/client";
import { batchItem, batchJob } from "../../db/schema/product";
import { refund } from "../credits";
import { creditCostForSkill } from "../credits/costs";
import { batchItemRefundKey } from "./run";

/** Mirrors STUCK_PENDING_MINUTES in src/lib/credits/reconcile.ts. */
const STUCK_ITEM_MINUTES = 10;
/**
 * Jobs get longer than items: a job legitimately stays 'running' for as long
 * as its slowest item, so the job cutoff must sit clear of the item cutoff or
 * this pass would fight a healthy in-flight run.
 */
const STUCK_JOB_MINUTES = 15;

const TERMINAL_ITEM_STATUSES = ["ok", "failed", "canceled"];

export interface SweepReport {
  /** Items refunded and marked failed because they sat 'running' too long. */
  refundedItems: number;
  /** Jobs whose final status flip was lost and has now been applied. */
  finalizedJobs: number;
}

export async function sweepBatches(db: Db): Promise<SweepReport> {
  const report: SweepReport = { refundedItems: 0, finalizedJobs: 0 };

  const itemCutoff = new Date(Date.now() - STUCK_ITEM_MINUTES * 60 * 1000);
  const stuck = await db
    .select({ item: batchItem, job: batchJob })
    .from(batchItem)
    .innerJoin(batchJob, eq(batchItem.batchJobId, batchJob.id))
    .where(and(eq(batchItem.status, "running"), lt(batchItem.createdAt, itemCutoff)));

  for (const { item, job } of stuck) {
    const result = await refund(db, {
      organizationId: job.organizationId,
      userId: job.createdBy,
      amount: creditCostForSkill(job.skillId),
      refId: item.id,
      idempotencyKey: batchItemRefundKey(job.id, item.idx),
    });
    await db
      .update(batchItem)
      .set({ status: "failed", errorCode: "sweep_stuck_running", completedAt: new Date() })
      .where(and(eq(batchItem.id, item.id), eq(batchItem.status, "running")));
    if (result.applied) report.refundedItems += 1;
  }

  const jobCutoff = new Date(Date.now() - STUCK_JOB_MINUTES * 60 * 1000);
  const staleJobs = await db
    .select({ id: batchJob.id })
    .from(batchJob)
    .where(and(eq(batchJob.status, "running"), lt(batchJob.updatedAt, jobCutoff)));

  for (const { id } of staleJobs) {
    const items = await db
      .select({ status: batchItem.status })
      .from(batchItem)
      .where(eq(batchItem.batchJobId, id));
    if (items.some((it) => !TERMINAL_ITEM_STATUSES.includes(it.status))) continue;

    // 'failed' only when nothing at all came out of the run; any successful
    // item makes the job 'done' with per-item failures visible on the items,
    // matching how runBatch finalizes.
    const anyOk = items.some((it) => it.status === "ok");
    const now = new Date();
    await db
      .update(batchJob)
      .set({ status: anyOk ? "done" : "failed", updatedAt: now, completedAt: now })
      .where(and(eq(batchJob.id, id), eq(batchJob.status, "running")));
    report.finalizedJobs += 1;
  }

  return report;
}
