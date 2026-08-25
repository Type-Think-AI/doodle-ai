import type { APIContext } from 'astro';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../../../../../db/client';
import { user } from '../../../../../db/schema/auth';
import { creditLedger } from '../../../../../db/schema/billing';
import { getBalance } from '../../../../../lib/credits';
import { resolvePersonalOrgId } from '../../../../../lib/admin/queries';
import { requireAdminRead } from '../../../../../lib/auth/admin-guard';
import { apiError, apiJson } from '../../../../../lib/auth/guards';

export const prerender = false;

/**
 * GET /api/admin/users/:id/credits
 *
 * Returns the user's current credit balance and recent ledger entries.
 * Used by the admin credit management dialog to show live data.
 */
export async function GET(context: APIContext): Promise<Response> {
	const admin = await requireAdminRead(context);
	if (admin instanceof Response) return admin;

	const userId = context.params.id;
	if (!userId) return apiError('not_found', 'User not found.', 404);

	const db = getDb(context);

	// Verify user exists and get basic info.
	const userRows = await db
		.select({ name: user.name, email: user.email })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	if (userRows.length === 0) return apiError('not_found', 'User not found.', 404);
	const { name, email } = userRows[0]!;

	// Resolve personal org.
	const orgId = await resolvePersonalOrgId(db, userId);
	if (!orgId) {
		return apiJson({ userId, name, email, balance: 0, ledger: [] });
	}

	const balance = await getBalance(db, orgId);

	// Last 20 ledger entries for this user.
	const ledger = await db
		.select({
			id: creditLedger.id,
			delta: creditLedger.delta,
			reason: creditLedger.reason,
			refId: creditLedger.refId,
			balanceAfter: creditLedger.balanceAfter,
			createdAt: creditLedger.createdAt,
		})
		.from(creditLedger)
		.where(eq(creditLedger.organizationId, orgId))
		.orderBy(desc(creditLedger.createdAt))
		.limit(20);

	return apiJson({
		userId,
		name,
		email,
		balance,
		ledger: ledger.map((row) => ({
			id: row.id,
			delta: row.delta,
			reason: row.reason,
			refId: row.refId,
			balanceAfter: row.balanceAfter,
			createdAt: row.createdAt.getTime(),
		})),
	});
}
