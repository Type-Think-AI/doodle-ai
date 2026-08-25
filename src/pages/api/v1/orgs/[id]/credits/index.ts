import type { APIContext } from "astro";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../../../../../db/client";
import { creditLedger } from "../../../../../../db/schema/billing";
import { orgLimits } from "../../../../../../db/schema/billing";
import { apiJson } from "../../../../../../lib/auth/guards";
import { getBalance } from "../../../../../../lib/credits";
import { requireOrgById } from "../../../../../../lib/org/route";

export const prerender = false;

/**
 * GET /api/v1/orgs/:id/credits — the team-settings credits summary.
 *
 * `monthSpend` sums this calendar month's `generation`-reason rows only
 * (matching the cap check in src/mastra/tools/generate-doodle.ts, which
 * reads the exact same window) — purchases, grants and transfers don't
 * count against the cap and shouldn't count toward this number either.
 */
export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrgById(context, context.params.id, { credits: ["read"] });
  if (org instanceof Response) return org;

  const db = getDb(context);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [balance, spendRows, limitRows] = await Promise.all([
    getBalance(db, org.orgId),
    db
      .select({ spend: sql<number>`sum(-${creditLedger.delta})` })
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.organizationId, org.orgId),
          eq(creditLedger.reason, "generation"),
          gte(creditLedger.createdAt, monthStart),
        ),
      ),
    db.select().from(orgLimits).where(eq(orgLimits.organizationId, org.orgId)).limit(1),
  ]);

  const limits = limitRows[0];
  return apiJson({
    orgId: org.orgId,
    balance,
    monthSpend: Number(spendRows[0]?.spend) || 0,
    monthlyCreditCap: limits?.monthlyCreditCap ?? null,
    generationsPerMinute: limits?.generationsPerMinute ?? 40,
  });
}
