import type { APIContext } from 'astro';
import { eq } from 'drizzle-orm';
import { getDb } from '../../../../../db/client';
import { isPlatformRole, user } from '../../../../../db/schema/auth';
import { recordAudit, clientIp } from '../../../../../lib/admin/audit';
import { readJson } from '../../../../../lib/api/body';
import { requireAdmin } from '../../../../../lib/auth/admin-guard';
import { apiError, apiJson } from '../../../../../lib/auth/guards';

export const prerender = false;

export async function PATCH(context: APIContext): Promise<Response> {
	const result = await requireAdmin(context);
	if (result instanceof Response) return result;

	const targetId = context.params.id;
	if (!targetId) return apiError('not_found', 'User not found.', 404);
	if (targetId === result.user.id) {
		return apiError('cannot_change_own_role', 'You cannot change your own platform role.', 400);
	}

	const body = await readJson(context.request);
	const role = body?.role;
	if (typeof role !== 'string' || !isPlatformRole(role)) {
		return apiError('invalid_role', 'Role must be one of user, support, or admin.', 400);
	}

	const db = getDb(context);
	const targetRows = await db
		.select({ platformRole: user.platformRole, email: user.email })
		.from(user)
		.where(eq(user.id, targetId))
		.limit(1);
	const target = targetRows[0];
	if (!target) return apiError('not_found', 'User not found.', 404);

	await db.update(user).set({ platformRole: role }).where(eq(user.id, targetId));
	await recordAudit(db, {
		actorUserId: result.user.id,
		action: 'user.role.change',
		targetType: 'user',
		targetId,
		detail: { from: target.platformRole, to: role, targetEmail: target.email },
		ipAddress: clientIp(context),
	});

	return apiJson({ ok: true, role });
}
