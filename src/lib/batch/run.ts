/* The batch fan-out worker.
 *
 * Runs inside `ctx.waitUntil()`, kicked off by POST /api/v1/batches after
 * that route has already returned 202. There is no queue, no Durable Object
 * and no Workflow in this stack — only an hourly cron — and none of those is
 * worth adding for this (see the plan's §5 option table: a Workflow's replay
 * would duplicate idempotency the ledger already provides, and a DO would
 * only be a mutex that D1's single writer already is).
 *
 * `waitUntil` has no delivery guarantee: if the isolate is evicted mid-run,
 * whatever hasn't finished simply stops. That is survivable rather than
 * lossy, and deliberately so — every credit is reserved up front by the
 * route, every item's completion is a separate row write, and
 * src/lib/batch/sweep.ts refunds anything left `running` on the next cron
 * tick. An evicted isolate makes a batch late, never silently wrong.
 *
 * This module constructs its own Drizzle client from `env.DB`: there is no
 * `APIContext` inside `waitUntil`, so `getDb`/`withDbSession` (which take
 * one) are unusable here. Bare `drizzle(env.DB)` is also the right call for
 * a writer — the D1 Sessions API those helpers add exists to route *reads*
 * to replicas, and every read below must see this run's own writes.
 */
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import type { Db } from "../../db/client";
import { readSecret } from "../secrets";
import { asset, batchItem, batchJob, generation } from "../../db/schema/product";
import { refund } from "../credits";
import { creditCostForSkill } from "../credits/costs";
import { buildBatchPrompt, callPicx } from "./prompt";

/**
 * How many PicX calls are in flight at once. The Worker CPU limit is about
 * CPU time, not wall time, and these items are almost entirely spent waiting
 * on `fetch` — so 12 variants at concurrency 4 is ~3 rounds of network wait,
 * comfortably inside the limit while staying polite to the upstream API.
 */
const CONCURRENCY = 4;

/** Terminal item states — a job is finished when no item is outside this set. */
const TERMINAL_ITEM_STATUSES = new Set(["ok", "failed", "canceled"]);

export function batchItemRefundKey(jobId: string, idx: number): string {
  return `refund:batch:${jobId}:${idx}`;
}

/**
 * Process every queued item of `jobId`. Safe to call more than once for the
 * same job concurrently: item claiming is atomic (see `claimItem`), and both
 * the credit refunds and the job status flip are idempotent.
 */
export async function runBatch(env: Env, jobId: string): Promise<void> {
  const db: Db = drizzle(env.DB, { schema });

  const jobRows = await db.select().from(batchJob).where(eq(batchJob.id, jobId));
  const job = jobRows[0];
  if (!job) return;
  // 'done' / 'failed' / 'canceled' means someone already finished or stopped
  // this job — a duplicate waitUntil or a sweep resumption must not restart it.
  if (job.status !== "queued" && job.status !== "running") return;

  if (job.status === "queued") {
    await db
      .update(batchJob)
      .set({ status: "running", updatedAt: new Date() })
      .where(and(eq(batchJob.id, jobId), eq(batchJob.status, "queued")));
  }

  const queued = await db
    .select()
    .from(batchItem)
    .where(and(eq(batchItem.batchJobId, jobId), eq(batchItem.status, "queued")))
    .orderBy(batchItem.idx);

  const platformKey = await readSecret(env.PICX_API_KEY, "PICX_API_KEY");

  for (let i = 0; i < queued.length; i += CONCURRENCY) {
    const chunk = queued.slice(i, i + CONCURRENCY);
    // Chunked rather than a rolling window: one fewer moving part, and the
    // items are near-identical in cost so a rolling window would buy little.
    await Promise.all(chunk.map((item) => processItem(db, job, item, platformKey)));
  }

  await finalizeJob(db, jobId);
}

/**
 * Claim one item by flipping 'queued' -> 'running'. The number of rows the
 * UPDATE actually touches IS the lock: a second runner racing for the same
 * item matches zero rows and backs off. This needs no advisory lock for the
 * reason already argued at length in src/lib/credits/index.ts's header — D1
 * is single-writer, so this statement cannot interleave with another.
 *
 * `.returning()` is how the affected-row count is read back; Drizzle's D1
 * driver surfaces it as the returned array's length.
 */
async function claimItem(db: Db, itemId: string): Promise<boolean> {
  const claimed = await db
    .update(batchItem)
    .set({ status: "running" })
    .where(and(eq(batchItem.id, itemId), eq(batchItem.status, "queued")))
    .returning({ id: batchItem.id });
  return claimed.length === 1;
}

async function processItem(
  db: Db,
  job: typeof batchJob.$inferSelect,
  item: typeof batchItem.$inferSelect,
  platformKey: string | undefined,
): Promise<void> {
  if (!(await claimItem(db, item.id))) return;

  const cost = creditCostForSkill(job.skillId);

  if (!platformKey) {
    await failItem(db, job, item, cost, "picx_not_configured");
    return;
  }

  // Built per item, not per job: the builders in doodle-constants.ts
  // randomize on each call, and that is exactly what makes N calls with the
  // same inputs produce N distinct variants.
  const built = buildBatchPrompt(job.skillId, { styleId: job.styleId, description: job.description });
  if (built.requiresPhoto && !job.sourceAssetUrl) {
    await failItem(db, job, item, cost, "missing_source_photo");
    return;
  }

  const result = await callPicx(platformKey, built, {
    sourceUrl: job.sourceAssetUrl,
    refUrl: job.refAssetUrl,
  });

  if (!result.ok || !result.url) {
    await failItem(db, job, item, cost, result.error ?? "generation_failed");
    return;
  }

  const now = new Date();
  const generationId = crypto.randomUUID();
  // The generation row is written already-'ok': unlike the single-generation
  // path there is no window to protect — the image exists by the time we get
  // here, and the credit was reserved by the route long before. Writing it
  // 'pending' first would only expose it to reconcile.ts's stuck-pending
  // refund and double-refund the item.
  await db.insert(generation).values({
    id: generationId,
    userId: job.createdBy,
    organizationId: job.organizationId,
    projectId: job.projectId,
    skillId: job.skillId,
    styleId: job.styleId,
    prompt: built.prompt,
    sourceAssetUrl: job.sourceAssetUrl,
    refAssetUrl: job.refAssetUrl,
    creditsCharged: cost,
    status: "ok",
    outputUrl: result.url,
    createdAt: now,
    completedAt: now,
  });

  if (job.projectId) {
    await db.insert(asset).values({
      id: crypto.randomUUID(),
      organizationId: job.organizationId,
      projectId: job.projectId,
      url: result.url,
      kind: "generation",
      generationId,
      reviewState: "draft",
      createdBy: job.createdBy,
      createdAt: now,
    });
  }

  await db
    .update(batchItem)
    .set({ status: "ok", outputUrl: result.url, generationId, completedAt: now })
    .where(and(eq(batchItem.id, item.id), eq(batchItem.status, "running")));
}

/**
 * Refund this one item's share of the job's up-front reservation and mark it
 * failed. The idempotency key is derived from (jobId, idx) so a retry, a
 * duplicate runner and the cron sweep all collapse onto the same ledger row
 * — refunding twice is impossible by construction, not by care.
 */
async function failItem(
  db: Db,
  job: typeof batchJob.$inferSelect,
  item: typeof batchItem.$inferSelect,
  cost: number,
  errorCode: string,
): Promise<void> {
  await refund(db, {
    organizationId: job.organizationId,
    userId: job.createdBy,
    amount: cost,
    refId: item.id,
    idempotencyKey: batchItemRefundKey(job.id, item.idx),
  });
  await db
    .update(batchItem)
    .set({ status: "failed", errorCode: errorCode.slice(0, 200), completedAt: new Date() })
    .where(eq(batchItem.id, item.id));
}

/**
 * Flip the job to 'done' once every item is terminal.
 *
 * 'done' even when some items failed: the *job* ran to completion, and each
 * failure is already visible (and already refunded) on its own item row.
 * Collapsing "6 of 8 succeeded" into a job-level 'failed' would throw away
 * the six good images from the client's point of view.
 */
export async function finalizeJob(db: Db, jobId: string): Promise<boolean> {
  const items = await db
    .select({ status: batchItem.status })
    .from(batchItem)
    .where(eq(batchItem.batchJobId, jobId));
  if (items.some((it) => !TERMINAL_ITEM_STATUSES.has(it.status))) return false;

  const now = new Date();
  await db
    .update(batchJob)
    .set({ status: "done", updatedAt: now, completedAt: now })
    .where(and(eq(batchJob.id, jobId), eq(batchJob.status, "running")));
  return true;
}
