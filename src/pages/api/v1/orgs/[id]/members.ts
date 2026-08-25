import type { APIContext } from "astro";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { member, user } from "../../../../../db/schema/auth";
import { creditLedger } from "../../../../../db/schema/billing";
import { apiJson } from "../../../../../lib/auth/guards";
import { requireOrgById } from "../../../../../lib/org/route";
import type { MemberDto, OrgRole } from "../../../../../lib/api/dto";

export const prerender = false;

const SPEND_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * GET /api/v1/orgs/:id/members — the member table *and* per-member spend.
 *
 * One route feeds both because the two are always shown together (the team
 * dashboard's "who burned what" list is the same rows as the settings
 * member table). The spend sum is served by `ledger_org_actor_created_idx`
 * (organization_id, user_id, created_at) — see src/db/schema/billing.ts.
 * `SUM(-delta)` because generation rows are negative deltas and spend is
 * shown as a positive number.
 */
export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrgById(context, context.params.id);
  if (org instanceof Response) return org;

  const db = getDb(context);
  const since = new Date(Date.now() - SPEND_WINDOW_MS);

  const [rows, spendRows] = await Promise.all([
    db
      .select({
        id: member.id,
        userId: member.userId,
        role: member.role,
        createdAt: member.createdAt,
        name: user.name,
        email: user.email,
        image: user.image,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, org.orgId)),
    db
      .select({ userId: creditLedger.userId, spend: sql<number>`sum(-${creditLedger.delta})` })
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.organizationId, org.orgId),
          eq(creditLedger.reason, "generation"),
          gte(creditLedger.createdAt, since),
        ),
      )
      .groupBy(creditLedger.userId),
  ]);

  const spendByUser = new Map(spendRows.map((r) => [r.userId, Number(r.spend) || 0]));

  const members: MemberDto[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.name,
    email: r.email,
    image: r.image ?? null,
    role: r.role as OrgRole,
    spend30d: spendByUser.get(r.userId) ?? 0,
    joinedAt: r.createdAt.getTime(),
  }));

  members.sort((a, b) => a.joinedAt - b.joinedAt);

  return apiJson({ members, viewer: { userId: org.user.id, role: org.role } });
}
