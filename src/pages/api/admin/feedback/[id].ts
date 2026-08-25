import type { APIContext } from 'astro';
import { eq } from 'drizzle-orm';
import { getDb } from '../../../../db/client';
import { feedback } from '../../../../db/schema/product';
import { recordAudit, clientIp } from '../../../../lib/admin/audit';
import { requireAdmin } from '../../../../lib/auth/admin-guard';
import { apiError, apiJson } from '../../../../lib/auth/guards';
import { readJson } from '../../../../lib/api/body';

export const prerender = false;

type FeedbackStatus = 'new' | 'reviewing' | 'resolved' | 'wont_fix';
const VALID_STATUSES: FeedbackStatus[] = ['new', 'reviewing', 'resolved', 'wont_fix'];

export async function PATCH(context: APIContext): Promise<Response> {
	const admin = await requireAdmin(context);
	if (admin instanceof Response) return admin;

	const status = (await readJson(context.request))?.status;
	if (typeof status !== 'string' || !VALID_STATUSES.includes(status as FeedbackStatus)) {
		return apiError('invalid_status', 'Feedback status must be new, reviewing, resolved, or wont_fix.', 400);
	}

	const id = context.params.id;
	if (!id) return apiError('not_found', "That feedback doesn't exist.", 404);

	const db = getDb(context);
	const now = new Date();
	const updated = await db
		.update(feedback)
		.set({ status, triagedBy: admin.user.id, triagedAt: now })
		.where(eq(feedback.id, id))
		.returning({ id: feedback.id });
	if (updated.length === 0) return apiError('not_found', "That feedback doesn't exist.", 404);

	await recordAudit(db, {
		actorUserId: admin.user.id,
		action: 'feedback.triage',
		targetType: 'feedback',
		targetId: id,
		detail: { status },
		ipAddress: clientIp(context),
	});

	return apiJson({ ok: true });
}
