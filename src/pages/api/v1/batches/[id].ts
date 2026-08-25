import type { APIContext } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db/client";
import { batchItem, batchJob } from "../../../../db/schema/product";
import { apiError, apiJson, requireOrg } from "../../../../lib/auth/guards";
import { refund } from "../../../../lib/credits";
import { creditCostForSkill } from "../../../../lib/credits/costs";
import { batchItemRefundKey } from "../../../../lib/batch/run";
import type { BatchDto, BatchItemDto } from "../../../../lib/api/dto";

export const prerender = false;

function notFound(): Response {
  return apiError("not_found", "That batch doesn't exist.", 404);
}

function toBatchDto(job: typeof batchJob.$inferSelect, items: (typeof batchItem.$inferSelect)[]): BatchDto {
  const itemDtos: BatchItemDto[] = items
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map((it) => ({ idx: it.idx, status: it.status as BatchItemDto["status"], outputUrl: it.outputUrl, errorCode: it.errorCode }));
  return {
    id: job.id,
    status: job.status as BatchDto["status"],
    skillId: job.skillId,
    variantCount: job.variantCount,
    creditsReserved: job.creditsReserved,
    items: itemDtos,
    createdAt: job.createdAt.getTime(),
    completedAt: job.completedAt?.getTime() ?? null,
  };
}

/** GET /api/v1/batches/:id — the poll target for a running batch. */
export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { batch: ["create"] });
  if (org instanceof Response) return org;
  const id = context.params.id;
  if (!id) return notFound();

  const db = getDb(context);
  const rows = await db
    .select()
    .from(batchJob)
    .where(and(eq(batchJob.id, id), eq(batchJob.organizationId, org.orgId)))
    .limit(1);
  const job = rows[0];
  if (!job) return notFound();

  const items = await db.select().from(batchItem).where(eq(batchItem.batchJobId, id));
  return apiJson({ batch: toBatchDto(job, items) });
}

/**
 * DELETE /api/v1/batches/:id — cancel, refunding every item still queued.
 *
 * Items already `running` are left alone: they may complete moments after
 * this call and their own refund/finalize path (runBatch / sweep.ts)
 * handles them correctly either way. Only `queued` items — nothing has been
 * spent attempting them — are safe to cancel and refund right here.
 */
export async function DELETE(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { batch: ["cancel"] });
  if (org instanceof Response) return org;
  const id = context.params.id;
  if (!id) return notFound();

  const db = getDb(context);
  const rows = await db
    .select()
    .from(batchJob)
    .where(and(eq(batchJob.id, id), eq(batchJob.organizationId, org.orgId)))
    .limit(1);
  const job = rows[0];
  if (!job) return notFound();
  if (job.status === "done" || job.status === "failed" || job.status === "canceled") {
    return apiJson({ batch: toBatchDto(job, await db.select().from(batchItem).where(eq(batchItem.batchJobId, id))) });
  }

  const queuedItems = await db
    .select()
    .from(batchItem)
    .where(and(eq(batchItem.batchJobId, id), eq(batchItem.status, "queued")));

  const cost = creditCostForSkill(job.skillId);
  for (const item of queuedItems) {
    const claimed = await db
      .update(batchItem)
      .set({ status: "canceled", completedAt: new Date() })
      .where(and(eq(batchItem.id, item.id), eq(batchItem.status, "queued")))
      .returning({ id: batchItem.id });
    if (claimed.length === 0) continue; // Lost the race to runBatch's own claim — let it proceed normally.
    await refund(db, {
      organizationId: job.organizationId,
      userId: job.createdBy,
      amount: cost,
      refId: item.id,
      idempotencyKey: batchItemRefundKey(job.id, item.idx),
    });
  }

  const remaining = await db.select().from(batchItem).where(eq(batchItem.batchJobId, id));
  const stillActive = remaining.some((it) => it.status === "queued" || it.status === "running");
  const updated = await db
    .update(batchJob)
    .set({ status: stillActive ? job.status : "canceled", updatedAt: new Date(), completedAt: stillActive ? null : new Date() })
    .where(eq(batchJob.id, id))
    .returning();

  return apiJson({ batch: toBatchDto(updated[0] ?? job, remaining) });
}
