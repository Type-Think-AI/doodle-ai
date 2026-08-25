import type { APIContext } from 'astro';
import { eq } from 'drizzle-orm';
import { getDb } from '../../../../db/client';
import { user } from '../../../../db/schema/auth';
import { grant } from '../../../../lib/credits';
import { resolvePersonalOrgId } from '../../../../lib/admin/queries';
import { recordAudit, clientIp } from '../../../../lib/admin/audit';
import { readJson } from '../../../../lib/api/body';
import { requireAdmin } from '../../../../lib/auth/admin-guard';
import { apiError, apiJson } from '../../../../lib/auth/guards';

export const prerender = false;

/**
 * POST /api/admin/credits/grant
 *
 * Admin grants credits to a user's personal org.
 * Body: { userId: string, amount: number, note?: string }
 *
 * The grant lands in the user's personal org — the pool their own runs draw
 * from. Team pools should be topped up via the future org credit endpoint or
 * a transfer.
 */
export async function POST(context: APIContext): Promise<Response> {
	const admin = await requireAdmin(context);
	if (admin instanceof Response) return admin;

	const body = await readJson(context.request);
	if (!body) return apiError('bad_request', 'Expected a JSON body.', 400);

	const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
	const amount = typeof body.amount === 'number' ? body.amount : NaN;
	const note = typeof body.note === 'string' ? body.note.trim() : '';

	if (!userId) return apiError('bad_request', '`userId` is required.', 400);
	if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
		return apiError('bad_request', '`amount` must be a positive integer.', 400);
	}
	if (amount > 100_000) {
		return apiError('bad_request', '`amount` must be 100,000 or fewer per grant.', 400);
	}

	const db = getDb(context);

	// Verify the target user exists.
	const targetRows = await db
		.select({ email: user.email })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	if (targetRows.length === 0) return apiError('not_found', 'User not found.', 404);
	const targetEmail = targetRows[0]!.email;

	// Resolve the user's personal org (the pool their own runs draw from).
	const orgId = await resolvePersonalOrgId(db, userId);
	if (!orgId) {
		return apiError('not_found', 'Could not resolve personal org for this user. They may need to sign in once.', 404);
	}

	const result = await grant(db, {
		organizationId: orgId,
		userId: admin.user.id, // The admin is the actor.
		amount,
		reason: 'admin_adjustment',
		refId: note || undefined,
		idempotencyKey: `admin_grant:${crypto.randomUUID()}`,
	});

	// Audit AFTER the grant succeeds — if the grant fails, no audit is needed.
	// If this audit write fails, the grant already landed; the error is surfaced
	// to the admin so they know the trail is incomplete.
	await recordAudit(db, {
		actorUserId: admin.user.id,
		action: 'credits.grant',
		targetType: 'user',
		targetId: userId,
		detail: { amount, orgId, note: note || null, targetEmail, balanceAfter: result.balance },
		ipAddress: clientIp(context),
	});

	return apiJson({ ok: true, balance: result.balance, applied: result.applied });
}
