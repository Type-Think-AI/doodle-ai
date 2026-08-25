/* Shared "which teams does this user belong to" query.
 *
 * Extracted so the org switcher (GET /api/v1/orgs) and any other caller that
 * needs the same payload agree on one shape and one set of reads. It returns
 * exactly the `OrgDto[]` that GET /api/v1/me puts in its `orgs` field — the
 * two are deliberately identical so the client can hydrate the switcher from
 * either call. (src/pages/api/v1/me.ts still carries its own copy of this
 * query: it is frozen/committed code owned by another workstream, and the
 * cost of leaving the duplication is one query definition versus the risk of
 * editing the single hydration endpoint out from under it.)
 */
import { eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { member, organization } from "../../db/schema/auth";
import { creditBalanceOrg } from "../../db/schema/billing";
import type { OrgDto } from "../api/dto";

export async function listOrgsForUser(db: Db, userId: string): Promise<OrgDto[]> {
  const memberships = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      isPersonal: organization.isPersonal,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId));

  // One balance + member-count read per org. `organizationLimit` is 5
  // (src/lib/auth/index.ts), so this fans out to a handful of indexed reads,
  // not an unbounded N+1.
  return await Promise.all(
    memberships.map(async (m) => {
      const [balRows, countRows] = await Promise.all([
        db
          .select({ balance: creditBalanceOrg.balance })
          .from(creditBalanceOrg)
          .where(eq(creditBalanceOrg.organizationId, m.id)),
        db.select({ count: sql<number>`count(*)` }).from(member).where(eq(member.organizationId, m.id)),
      ]);
      return {
        id: m.id,
        name: m.name,
        slug: m.slug,
        // Every member row's role is written by our own code from the five in
        // src/lib/auth/org-access.ts — requireOrg() throws loudly if it ever
        // sees one outside that set, so this cast asserts an invariant.
        role: m.role as OrgDto["role"],
        isPersonal: m.isPersonal,
        balance: balRows[0]?.balance ?? 0,
        memberCount: countRows[0]?.count ?? 1,
      };
    }),
  );
}

/** The same payload for a single org, or null when the user isn't a member. */
export async function orgDtoFor(db: Db, userId: string, orgId: string): Promise<OrgDto | null> {
  const all = await listOrgsForUser(db, userId);
  return all.find((o) => o.id === orgId) ?? null;
}
