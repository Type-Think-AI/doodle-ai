import type { APIContext } from "astro";
import { apiError, apiJson } from "../../../../../../lib/auth/guards";
import { newId, readJson } from "../../../../../../lib/api/body";
import { transfer } from "../../../../../../lib/credits";
import { requireOrgById } from "../../../../../../lib/org/route";
import { getDb } from "../../../../../../db/client";

export const prerender = false;

/**
 * POST /api/v1/orgs/:id/credits/transfer — `{ toOrgId, amount }`.
 *
 * Requires `credits:transfer` on BOTH ends: the caller must be able to move
 * money out of `:id` and into `toOrgId`, so this checks membership+
 * permission on each independently rather than trusting that owning one
 * implies anything about the other.
 */
export async function POST(context: APIContext): Promise<Response> {
  const from = await requireOrgById(context, context.params.id, { credits: ["transfer"] });
  if (from instanceof Response) return from;

  const body = await readJson(context.request);
  const toOrgId = body ? String(body.toOrgId ?? "") : "";
  const amount = body && typeof body.amount === "number" ? Math.floor(body.amount) : NaN;
  if (!toOrgId) return apiError("bad_request", "`toOrgId` is required.", 400);
  if (!Number.isFinite(amount) || amount <= 0) return apiError("bad_request", "`amount` must be a positive number.", 400);

  const to = await requireOrgById(context, toOrgId, { credits: ["transfer"] });
  if (to instanceof Response) return to;

  const db = getDb(context);
  const result = await transfer(db, {
    fromOrgId: from.orgId,
    toOrgId: to.orgId,
    amount,
    userId: from.user.id,
    transferId: newId(),
  });

  if (!result.ok) {
    return apiError("insufficient_credits", `This team only has ${result.balance} credits.`, 409, {
      balance: result.balance,
      required: result.required,
    });
  }

  return apiJson({ fromBalance: result.fromBalance, toBalance: result.toBalance });
}
