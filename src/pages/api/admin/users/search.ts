import type { APIContext } from 'astro';
import { sql } from 'drizzle-orm';
import { getDb } from '../../../../db/client';
import { user } from '../../../../db/schema/auth';
import { creditBalanceOrg } from '../../../../db/schema/billing';
import { requireAdminRead } from '../../../../lib/auth/admin-guard';
import { apiError, apiJson } from '../../../../lib/auth/guards';

export const prerender = false;

/**
 * GET /api/admin/users/search?q=<query>
 *
 * Search users by name or email (LIKE match). Returns up to 10 results
 * with their personal-org credit balance for the admin credit-grant flow.
 */
export async function GET(context: APIContext): Promise<Response> {
	const admin = await requireAdminRead(context);
	if (admin instanceof Response) return admin;

	const url = new URL(context.request.url);
	const q = url.searchParams.get('q')?.trim() ?? '';

	if (q.length < 2) {
		return apiError('bad_request', 'Query `q` must be at least 2 characters.', 400);
	}

	const db = getDb(context);
	const like = `%${q.toLowerCase()}%`;

	const rows = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			credits: sql<number>`COALESCE(${creditBalanceOrg.balance}, 0)`,
		})
		.from(user)
		.leftJoin(creditBalanceOrg, sql`${creditBalanceOrg.organizationId} = 'org_' || ${user.id}`)
		.where(sql`(LOWER(${user.name}) LIKE ${like} OR LOWER(${user.email}) LIKE ${like})`)
		.limit(10);

	return apiJson(rows.map((r) => ({
		id: r.id,
		name: r.name,
		email: r.email,
		credits: Number(r.credits) || 0,
	})));
}
