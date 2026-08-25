import type { APIContext } from "astro";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../../../../../db/client";
import { user } from "../../../../../../db/schema/auth";
import { creditLedger } from "../../../../../../db/schema/billing";
import { apiJson } from "../../../../../../lib/auth/guards";
import { requireOrgById } from "../../../../../../lib/org/route";

export const prerender = false;

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * GET /api/v1/orgs/:id/credits/by-member?since=<epoch-ms> — spend grouped by
 * actor. Same underlying rows as `GET /orgs/:id/members`'s `spend30d` field,
 * exposed on its own so a longer or shorter window doesn't require refetching
 * the whole member table.
 */
export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrgById(context, context.params.id, { credits: ["read"] });
  if (org instanceof Response) return org;

  const url = new URL(context.request.url);
  const sinceParam = url.searchParams.get("since");
  const since =
    sinceParam && Number.isFinite(Number.parseInt(sinceParam, 10))
      ? new Date(Number.parseInt(sinceParam, 10))
      : new Date(Date.now() - DEFAULT_WINDOW_MS);

  const db = getDb(context);
  const rows = await db
    .select({
      userId: creditLedger.userId,
      name: user.name,
      spend: sql<number>`sum(-${creditLedger.delta})`,
    })
    .from(creditLedger)
    .innerJoin(user, eq(user.id, creditLedger.userId))
    .where(
      and(
        eq(creditLedger.organizationId, org.orgId),
        eq(creditLedger.reason, "generation"),
        gte(creditLedger.createdAt, since),
      ),
    )
    .groupBy(creditLedger.userId, user.name);

  const byMember = rows
    .map((r) => ({ userId: r.userId, name: r.name, spend: Number(r.spend) || 0 }))
    .sort((a, b) => b.spend - a.spend);

  return apiJson({ since: since.getTime(), byMember });
}
