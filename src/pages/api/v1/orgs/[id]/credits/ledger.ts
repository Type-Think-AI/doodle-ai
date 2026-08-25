import type { APIContext } from "astro";
import { and, desc, eq, lt } from "drizzle-orm";
import { getDb } from "../../../../../../db/client";
import { user } from "../../../../../../db/schema/auth";
import { creditLedger } from "../../../../../../db/schema/billing";
import { apiJson } from "../../../../../../lib/auth/guards";
import { intParam } from "../../../../../../lib/api/body";
import { requireOrgById } from "../../../../../../lib/org/route";

export const prerender = false;

const PAGE_DEFAULT = 50;
const PAGE_MAX = 200;

/**
 * GET /api/v1/orgs/:id/credits/ledger?limit=&before= — the raw feed behind
 * the credits tab, joined to `user` for the actor's display name (the
 * ledger's `userId` is "the acting member," not the org — see
 * src/db/schema/billing.ts). `before` is an epoch-ms cursor for
 * old-school offset-free pagination.
 */
export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrgById(context, context.params.id, { credits: ["read"] });
  if (org instanceof Response) return org;

  const url = new URL(context.request.url);
  const limit = intParam(url, "limit", PAGE_DEFAULT, PAGE_MAX);
  const beforeParam = url.searchParams.get("before");
  const before = beforeParam ? new Date(Number.parseInt(beforeParam, 10)) : null;

  const db = getDb(context);
  const rows = await db
    .select({
      id: creditLedger.id,
      delta: creditLedger.delta,
      reason: creditLedger.reason,
      refId: creditLedger.refId,
      balanceAfter: creditLedger.balanceAfter,
      createdAt: creditLedger.createdAt,
      actorId: creditLedger.userId,
      actorName: user.name,
    })
    .from(creditLedger)
    .innerJoin(user, eq(user.id, creditLedger.userId))
    .where(
      and(
        eq(creditLedger.organizationId, org.orgId),
        ...(before && !Number.isNaN(before.getTime()) ? [lt(creditLedger.createdAt, before)] : []),
      ),
    )
    .orderBy(desc(creditLedger.createdAt))
    .limit(limit);

  return apiJson({
    entries: rows.map((r) => ({
      id: r.id,
      delta: r.delta,
      reason: r.reason,
      refId: r.refId,
      balanceAfter: r.balanceAfter,
      actorId: r.actorId,
      actorName: r.actorName,
      createdAt: r.createdAt.getTime(),
    })),
  });
}
