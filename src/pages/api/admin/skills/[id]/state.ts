import type { APIContext } from 'astro';
import { eq } from 'drizzle-orm';
import { getDb } from '../../../../../db/client';
import { skillState } from '../../../../../db/schema/product';
import { recordAudit, clientIp } from '../../../../../lib/admin/audit';
import { requireAdmin } from '../../../../../lib/auth/admin-guard';
import { apiError, apiJson } from '../../../../../lib/auth/guards';
import { readJson } from '../../../../../lib/api/body';

export const prerender = false;

type SkillState = 'live' | 'paused';

export async function PATCH(context: APIContext): Promise<Response> {
	const admin = await requireAdmin(context);
	if (admin instanceof Response) return admin;

	const skillId = context.params.id?.trim();
	if (!skillId) return apiError('invalid_state', 'A skill id is required.', 400);

	const body = await readJson(context.request);
	if (!body) return apiError('invalid_state', 'Expected a JSON object.', 400);

	const allowedKeys = new Set(['state', 'featured', 'note']);
	if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
		return apiError('invalid_state', 'Only state, featured, and note are allowed.', 400);
	}
	if (!('state' in body) && !('featured' in body) && !('note' in body)) {
		return apiError('invalid_state', 'At least one skill state field is required.', 400);
	}

	let nextState: SkillState | undefined;
	if ('state' in body) {
		if (body.state !== 'live' && body.state !== 'paused') {
			return apiError('invalid_state', '`state` must be \'live\' or \'paused\'.', 400);
		}
		nextState = body.state;
	}
	if ('featured' in body && typeof body.featured !== 'boolean') {
		return apiError('invalid_state', '`featured` must be a boolean.', 400);
	}
	if ('note' in body && body.note !== null && typeof body.note !== 'string') {
		return apiError('invalid_state', '`note` must be a string or null.', 400);
	}

	const db = getDb(context);
	const current = await db.select().from(skillState).where(eq(skillState.skillId, skillId)).limit(1);
	const existing = current[0];
	const state = nextState ?? (existing?.state === 'paused' ? 'paused' : 'live');
	const featured = 'featured' in body ? body.featured as boolean : existing?.featured ?? false;
	const note = 'note' in body ? body.note as string | null : existing?.note ?? null;
	const updatedAt = new Date();

	await db
		.insert(skillState)
		.values({ skillId, state, featured, note, updatedBy: admin.user.id, updatedAt })
		.onConflictDoUpdate({
			target: skillState.skillId,
			set: { state, featured, note, updatedBy: admin.user.id, updatedAt },
		});

	await recordAudit(db, {
		actorUserId: admin.user.id,
		action: 'skill.state.change',
		targetType: 'skill',
		targetId: skillId,
		detail: { state, featured },
		ipAddress: clientIp(context),
	});

	return apiJson({ ok: true });
}
