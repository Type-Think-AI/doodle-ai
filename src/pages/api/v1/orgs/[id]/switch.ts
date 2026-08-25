import type { APIContext } from "astro";
import { getDb } from "../../../../../db/client";
import { apiError, apiJson } from "../../../../../lib/auth/guards";
import { createAuth } from "../../../../../lib/auth";
import { orgDtoFor } from "../../../../../lib/org/list";
import { requireOrgById } from "../../../../../lib/org/route";

export const prerender = false;

/**
 * POST /api/v1/orgs/:id/switch — make this the caller's active team.
 *
 * No permission beyond membership: every role can switch into a team it
 * belongs to. Returns the new OrgDto so the client rescopes in one round
 * trip (the UI then does a hard reload — see switchOrg() in
 * src/scripts/app/api-client.ts for why).
 */
export async function POST(context: APIContext): Promise<Response> {
  const org = await requireOrgById(context, context.params.id);
  if (org instanceof Response) return org;

  const auth = createAuth(context);
  try {
    await auth.api.setActiveOrganization({
      body: { organizationId: org.orgId },
      headers: context.request.headers,
    });
  } catch {
    return apiError("switch_failed", "Couldn't switch to that team.", 400);
  }

  const db = getDb(context);
  const dto = await orgDtoFor(db, org.user.id, org.orgId);
  if (!dto) return apiError("not_found", "Team not found.", 404);
  return apiJson({ org: dto });
}
