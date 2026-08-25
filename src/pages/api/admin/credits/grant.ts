import type { APIContext } from 'astro';
import { eq } from 'drizzle-orm';
import { getDb } from '../../../../db/client';
import { user } from '../../../../db/schema/auth';
import { getBalance, grant, spend } from '../../../../lib/credits';
import { resolvePersonalOrgId } from '../../../../lib/admin/queries';
import { recordAudit, clientIp } from '../../../../lib/admin/audit';
import { readJson } from '../../../../lib/api/body';
import { requireAdmin } from '../../../../lib/auth/admin-guard';
import { apiError, apiJson } from '../../../../lib/auth/guards';

export const prerender = false;

type Operation = 'add' | 'reduce' | 'set';
const VALID_OPS: Operation[] = ['add', 'reduce', 'set'];

/**
 * POST /api/admin/credits/grant
 *
 * Admin credit management — add, reduce, or set a user's credit balance.
 * Body: { userId: string, amount: number, operation?: 'add'|'reduce'|'set', note?: string }
 *
 * - add (default): grant `amount` credits on top of current balance.
 * - reduce: deduct `amount` credits. Fails if balance would go negative.
 * - set: set balance to exactly `amount`. Internally computes the delta needed.
 */
export async function POST(context: APIContext): Promise<Response> {
	const admin = await requireAdmin(context);
	if (admin instanceof Response) return admin;

	const body = await readJson(context.request);
	if (!body) return apiError('bad_request', 'Expected a JSON body.', 400);

	const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
	const amount = typeof body.amount === 'number' ? body.amount : NaN;
	const rawOp = typeof body.operation === 'string' ? body.operation : 'add';
	const operation: Operation = VALID_OPS.includes(rawOp as Operation) ? (rawOp as Operation) : 'add';
	const note = typeof body.note === 'string' ? body.note.trim() : '';

	if (!userId) return apiError('bad_request', '`userId` is required.', 400);
	if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
		return apiError('bad_request', '`amount` must be an integer.', 400);
	}
	if (operation === 'add' && amount <= 0) {
		return apiError('bad_request', '`amount` must be positive for add.', 400);
	}
	if (operation === 'reduce' && amount <= 0) {
		return apiError('bad_request', '`amount` must be positive for reduce.', 400);
	}
	if (operation === 'set' && amount < 0) {
		return apiError('bad_request', '`amount` cannot be negative for set.', 400);
	}
	if (amount > 1_000_000) {
		return apiError('bad_request', '`amount` must be 1,000,000 or fewer.', 400);
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

	// Resolve the user's personal org.
	const orgId = await resolvePersonalOrgId(db, userId);
	if (!orgId) {
		return apiError('not_found', 'Could not resolve personal org for this user. They may need to sign in once.', 404);
	}

	let balance: number;
	let effectiveDelta: number;

	if (operation === 'add') {
		const result = await grant(db, {
			organizationId: orgId,
			userId: admin.user.id,
			amount,
			reason: 'admin_adjustment',
			refId: note || undefined,
			idempotencyKey: `admin_grant:${crypto.randomUUID()}`,
		});
		balance = result.balance;
		effectiveDelta = amount;
	} else if (operation === 'reduce') {
		const result = await spend(db, {
			organizationId: orgId,
			userId: admin.user.id,
			amount,
			reason: 'admin_adjustment',
			refId: note || undefined,
			idempotencyKey: `admin_reduce:${crypto.randomUUID()}`,
		});
		if (!result.ok) {
			return apiError('insufficient_credits', `Cannot reduce by ${amount}. Current balance is only ${result.balance}.`, 409, {
				balance: result.balance,
				requested: amount,
			});
		}
		balance = result.balance;
		effectiveDelta = -amount;
	} else {
		// set: compute delta from current balance
		const current = await getBalance(db, orgId);
		const delta = amount - current;
		if (delta === 0) {
			return apiJson({ ok: true, balance: current, applied: false, operation: 'set', delta: 0 });
		}
		if (delta > 0) {
			const result = await grant(db, {
				organizationId: orgId,
				userId: admin.user.id,
				amount: delta,
				reason: 'admin_adjustment',
				refId: note || undefined,
				idempotencyKey: `admin_set:${crypto.randomUUID()}`,
			});
			balance = result.balance;
		} else {
			const result = await spend(db, {
				organizationId: orgId,
				userId: admin.user.id,
				amount: Math.abs(delta),
				reason: 'admin_adjustment',
				refId: note || undefined,
				idempotencyKey: `admin_set:${crypto.randomUUID()}`,
			});
			if (!result.ok) {
				return apiError('insufficient_credits', `Cannot set to ${amount}. Internal error.`, 500);
			}
			balance = result.balance;
		}
		effectiveDelta = delta;
	}

	await recordAudit(db, {
		actorUserId: admin.user.id,
		action: 'credits.grant',
		targetType: 'user',
		targetId: userId,
		detail: { operation, amount, delta: effectiveDelta, orgId, note: note || null, targetEmail, balanceAfter: balance },
		ipAddress: clientIp(context),
	});

	return apiJson({ ok: true, balance, applied: true, operation, delta: effectiveDelta });
}
