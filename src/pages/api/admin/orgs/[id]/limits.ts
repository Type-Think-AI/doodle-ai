import type { APIContext } from 'astro';
import { eq } from 'drizzle-orm';
import { getDb } from '../../../../../db/client';
import { organization } from '../../../../../db/schema/auth';
import { orgLimits } from '../../../../../db/schema/billing';
import { recordAudit, clientIp } from '../../../../../lib/admin/audit';
import { readJson } from '../../../../../lib/api/body';
import { requireAdmin } from '../../../../../lib/auth/admin-guard';
import { apiError, apiJson } from '../../../../../lib/auth/guards';

export const prerender = false;

/**
 * PATCH /api/admin/orgs/:id/limits
 *
 * Update an organization's rate and spend caps. Accepts any subset of
 * { monthlyCreditCap, perMemberDailyCap, generationsPerMinute }. Null clears
 * a cap (restores default/unlimited).
 */
export async function PATCH(context: APIContext): Promise<Response> {
	const admin = await requireAdmin(context);
	if (admin instanceof Response) return admin;

	const orgId = context.params.id;
	if (!orgId) return apiError('not_found', 'Organization not found.', 404);

	const body = await readJson(context.request);
	if (!body) return apiError('bad_request', 'Expected a JSON body.', 400);

	const db = getDb(context);

	// Verify the org exists.
	const orgRows = await db
		.select({ name: organization.name })
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);
	if (orgRows.length === 0) return apiError('not_found', 'Organization not found.', 404);
	const orgName = orgRows[0]!.name;

	// Validate inputs — each field is optional but if present must be valid.
	const updates: Record<string, number | null> = {};

	if ('monthlyCreditCap' in body) {
		const v = body.monthlyCreditCap;
		if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || !Number.isInteger(v))) {
			return apiError('bad_request', '`monthlyCreditCap` must be a non-negative integer or null.', 400);
		}
		updates.monthlyCreditCap = v as number | null;
	}
	if ('perMemberDailyCap' in body) {
		const v = body.perMemberDailyCap;
		if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || !Number.isInteger(v))) {
			return apiError('bad_request', '`perMemberDailyCap` must be a non-negative integer or null.', 400);
		}
		updates.perMemberDailyCap = v as number | null;
	}
	if ('generationsPerMinute' in body) {
		const v = body.generationsPerMinute;
		if (typeof v !== 'number' || !Number.isFinite(v) || v < 1 || !Number.isInteger(v) || v > 1000) {
			return apiError('bad_request', '`generationsPerMinute` must be an integer between 1 and 1000.', 400);
		}
		updates.generationsPerMinute = v;
	}

	if (Object.keys(updates).length === 0) {
		return apiError('bad_request', 'At least one limit field is required (monthlyCreditCap, perMemberDailyCap, generationsPerMinute).', 400);
	}

	// Read current values for audit detail.
	const currentRows = await db.select().from(orgLimits).where(eq(orgLimits.organizationId, orgId)).limit(1);
	const before = currentRows[0] ?? { monthlyCreditCap: null, perMemberDailyCap: null, generationsPerMinute: 40 };

	// Upsert — create with defaults if no row exists, otherwise update only the fields passed.
	const merged = {
		monthlyCreditCap: 'monthlyCreditCap' in updates ? updates.monthlyCreditCap : before.monthlyCreditCap,
		perMemberDailyCap: 'perMemberDailyCap' in updates ? updates.perMemberDailyCap : before.perMemberDailyCap,
		generationsPerMinute: 'generationsPerMinute' in updates ? updates.generationsPerMinute! : (before.generationsPerMinute ?? 40),
	};

	await db
		.insert(orgLimits)
		.values({ organizationId: orgId, ...merged })
		.onConflictDoUpdate({
			target: orgLimits.organizationId,
			set: merged,
		});

	await recordAudit(db, {
		actorUserId: admin.user.id,
		action: 'org.limits.change',
		targetType: 'organization',
		targetId: orgId,
		detail: { orgName, before, after: merged },
		ipAddress: clientIp(context),
	});

	return apiJson({ ok: true, limits: merged });
}
