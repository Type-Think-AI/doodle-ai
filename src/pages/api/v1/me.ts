import type { APIContext } from "astro";
import { eq, sql } from "drizzle-orm";
import { apiJson, requireOrg } from "../../../lib/auth/guards";
import { getDb } from "../../../db/client";
import { getBalance } from "../../../lib/credits";
import { creditBalanceOrg } from "../../../db/schema/billing";
import { member, organization } from "../../../db/schema/auth";
import type { OrgDto } from "../../../lib/api/dto";

export const prerender = false;

/**
 * GET /api/v1/me — the caller's profile plus their active team.
 *
 * B2B note: this is now the single hydration call for both the client
 * mirror (src/scripts/app/api-client.ts's whenMe()) and the sidebar
 * (src/scripts/app/sidebar.ts) — the two used to call this and getSession()
 * independently, which is exactly the double-D1-read this route now avoids
 * by being the one place both read `org`/`orgs` from. `credits.balance` is
 * the *active org's* pooled balance, never a personal figure — see
 * src/lib/credits/index.ts for why credits are org-owned.
 *
 * Works with either a session cookie or an `Authorization: Bearer` token.
 */
export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrg(context);
  if (org instanceof Response) return org;
  const { user, orgId, role } = org;

  const db = getDb(context);

  const [balance, memberships] = await Promise.all([
    getBalance(db, orgId),
    db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        isPersonal: organization.isPersonal,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(eq(member.userId, user.id)),
  ]);

  // One balance + member-count query per org the user belongs to. Membership
  // lists top out at 25 (organizationLimit/membershipLimit in
  // src/lib/auth/index.ts), so this fans out to at most a handful of cheap
  // indexed reads rather than a real N+1 concern.
  const orgs: OrgDto[] = await Promise.all(
    memberships.map(async (m) => {
      const [balRows, countRows] = await Promise.all([
        db.select({ balance: creditBalanceOrg.balance }).from(creditBalanceOrg).where(eq(creditBalanceOrg.organizationId, m.id)),
        db.select({ count: sql<number>`count(*)` }).from(member).where(eq(member.organizationId, m.id)),
      ]);
      return {
        id: m.id,
        name: m.name,
        slug: m.slug,
        // Every member row's role is written by our own code from the five
        // roles in src/lib/auth/org-access.ts — never Better Auth's default
        // "member" literal — so this cast documents an invariant rather
        // than papering over one. requireOrg() throws loudly if it ever
        // finds a role outside that set.
        role: m.role as OrgDto["role"],
        isPersonal: m.isPersonal,
        balance: balRows[0]?.balance ?? 0,
        memberCount: countRows[0]?.count ?? 1,
      };
    }),
  );

  const active = orgs.find((o) => o.id === orgId) ?? orgs[0];

  return apiJson({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image ?? null,
      emailVerified: user.emailVerified,
    },
    org: active ?? { id: orgId, name: "Team", slug: orgId, role, isPersonal: false, balance, memberCount: 1 },
    orgs,
    // Kept for any caller still reading the old top-level shape during
    // rollout; new code should read `org.balance`.
    credits: { balance },
  });
}
