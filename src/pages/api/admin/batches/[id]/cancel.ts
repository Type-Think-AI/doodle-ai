import type { APIContext } from 'astro';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../../../../../db/client';
import { batchItem, batchJob } from '../../../../../db/schema/product';
import { refund } from '../../../../../lib/credits';
import { creditCostForSkill } from '../../../../../lib/credits/costs';
import { batchItemRefundKey } from '../../../../../lib/batch/run';
import { recordAudit, clientIp } from '../../../../../lib/admin/audit';
import { requireAdmin } from '../../../../../lib/auth/admin-guard';
import { apiError, apiJson } from '../../../../../lib/auth/guards';

export const prerender = false;

/**
 * POST /api/admin/batches/:id/cancel
 *
 * Force-cancel a batch job that is stuck in 'queued' or 'running'. Marks all
 * non-terminal items as 'canceled', refunds their reserved credits (one per
 * item, idempotent via batchItemRefundKey), and sets the job status to
 * 'canceled'.
 *
 * Idempotent: calling it on an already-canceled job returns success with zero
 * refunds. Calling it on a 'done' or 'failed' job returns a 409 because
 * there is nothing to cancel — the credits are already settled.
 */
export async function POST(context: APIContext): Promise<Response> {
	const admin = await requireAdmin(context);
	if (admin instanceof Response) return admin;

	const jobId = context.params.id;
	if (!jobId) return apiError('not_found', 'Batch job not found.', 404);

	const db = getDb(context);

	const jobRows = await db.select().from(batchJob).where(eq(batchJob.id, jobId)).limit(1);
	const job = jobRows[0];
	if (!job) return apiError('not_found', 'Batch job not found.', 404);

	// Already terminal and not cancelable.
	if (job.status === 'done' || job.status === 'failed') {
		return apiError('already_completed', `This batch is already ${job.status}. Nothing to cancel.`, 409);
	}

	// Already canceled — idempotent success.
	if (job.status === 'canceled') {
		return apiJson({ ok: true, canceled: 0, refunded: 0 });
	}

	// Cancel all non-terminal items and refund their credits.
	const cancelableStatuses = ['queued', 'running'];
	const items = await db
		.select()
		.from(batchItem)
		.where(eq(batchItem.batchJobId, jobId));

	const pendingItems = items.filter((it) => cancelableStatuses.includes(it.status));
	let refundedCount = 0;
	const now = new Date();
	const costPerItem = creditCostForSkill(job.skillId);

	for (const item of pendingItems) {
		// Mark item canceled.
		await db
			.update(batchItem)
			.set({ status: 'canceled', errorCode: 'admin_canceled', completedAt: now })
			.where(and(eq(batchItem.id, item.id), eq(batchItem.status, item.status)));

		// Refund the item's reserved credit. Idempotent via the refund key.
		if (costPerItem > 0) {
			const result = await refund(db, {
				organizationId: job.organizationId,
				userId: job.createdBy,
				amount: costPerItem,
				refId: item.id,
				idempotencyKey: batchItemRefundKey(job.id, item.idx),
			});
			if (result.applied) refundedCount += 1;
		}
	}

	// Flip job status to canceled.
	await db
		.update(batchJob)
		.set({ status: 'canceled', updatedAt: now, completedAt: now })
		.where(eq(batchJob.id, jobId));

	await recordAudit(db, {
		actorUserId: admin.user.id,
		action: 'skill.state.change', // Reusing closest action; could add 'batch.cancel' later.
		targetType: 'generation',
		targetId: jobId,
		detail: {
			action: 'batch_cancel',
			skillId: job.skillId,
			canceledItems: pendingItems.length,
			refundedItems: refundedCount,
			creditsRefundedPerItem: costPerItem,
		},
		ipAddress: clientIp(context),
	});

	return apiJson({ ok: true, canceled: pendingItems.length, refunded: refundedCount });
}
