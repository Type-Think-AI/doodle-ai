import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { organization } from "../../../../../db/schema/auth";
import { apiError, apiJson } from "../../../../../lib/auth/guards";
import { createAuth } from "../../../../../lib/auth";
import { newId, optStr, readJson } from "../../../../../lib/api/body";
import { getBalance, transfer } from "../../../../../lib/credits";
import { orgDtoFor } from "../../../../../lib/org/list";
import { requireOrgById } from "../../../../../lib/org/route";

export const prerender = false;

const NAME_MAX_LEN = 60;

/** GET /api/v1/orgs/:id — one team's switcher payload. */
export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrgById(context, context.params.id);
  if (org instanceof Response) return org;

  const db = getDb(context);
  const dto = await orgDtoFor(db, org.user.id, org.orgId);
  if (!dto) return apiError("not_found", "Team not found.", 404);
  return apiJson({ org: dto });
}

/** PATCH /api/v1/orgs/:id — rename. */
export async function PATCH(context: APIContext): Promise<Response> {
  const org = await requireOrgById(context, context.params.id, { organization: ["update"] });
  if (org instanceof Response) return org;

  const body = (await readJson(context.request)) ?? {};
  const name = optStr(body.name)?.slice(0, NAME_MAX_LEN);
  if (!name) return apiError("bad_request", "Give the team a name.", 400);

  const db = getDb(context);
  // Written directly rather than through `auth.api.updateOrganization`: the
  // permission check has already happened in requireOrgById against our own
  // five roles, and the plugin endpoint would re-resolve membership and
  // re-run the same check for nothing.
  await db.update(organization).set({ name }).where(eq(organization.id, org.orgId));

  const dto = await orgDtoFor(db, org.user.id, org.orgId);
  return apiJson({ org: dto });
}

/**
 * DELETE /api/v1/orgs/:id — delete a team.
 *
 * Two refusals, both deliberate:
 *  - A personal org is never deletable. It is the user's own workspace and
 *    the target every other safety net (requireOrg's self-heal, the import
 *    route) assumes exists.
 *  - A team holding credits is never deleted silently, because deleting it
 *    destroys them (`credit_balance_org` cascades on the org row). Pass
 *    `?sweepTo=<orgId>` — normally the caller's personal org — to move the
 *    balance out first, in the same request.
 */
export async function DELETE(context: APIContext): Promise<Response> {
  const org = await requireOrgById(context, context.params.id, { organization: ["delete"] });
  if (org instanceof Response) return org;

  const db = getDb(context);
  const rows = await db
    .select({ isPersonal: organization.isPersonal })
    .from(organization)
    .where(eq(organization.id, org.orgId))
    .limit(1);
  if (!rows[0]) return apiError("not_found", "Team not found.", 404);
  if (rows[0].isPersonal) {
    return apiError("personal_org", "Your personal workspace can't be deleted.", 400);
  }

  const balance = await getBalance(db, org.orgId);
  if (balance > 0) {
    const sweepTo = new URL(context.request.url).searchParams.get("sweepTo");
    if (!sweepTo) {
      return apiError(
        "has_credits",
        `This team still holds ${balance} credit${balance === 1 ? "" : "s"}. Move them somewhere first.`,
        409,
        { balance },
      );
    }
    // The destination must be an org the caller can move credits into, not
    // just any org id they can name.
    const dest = await requireOrgById(context, sweepTo, { credits: ["transfer"] });
    if (dest instanceof Response) return dest;

    const result = await transfer(db, {
      fromOrgId: org.orgId,
      toOrgId: dest.orgId,
      amount: balance,
      userId: org.user.id,
      transferId: newId(),
    });
    if (!result.ok) return apiError("transfer_failed", "Couldn't move the credits out of that team.", 409);
  }

  const auth = await createAuth(context);
  try {
    await auth.api.deleteOrganization({
      body: { organizationId: org.orgId },
      headers: context.request.headers,
    });
  } catch (err) {
    const message =
      err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string"
        ? (err as { message: string }).message
        : "Couldn't delete that team.";
    return apiError("delete_failed", message, 400);
  }

  return apiJson({ deleted: org.orgId });
}
