import type { APIContext } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db/client";
import { asset, project } from "../../../../db/schema/product";
import { apiError, apiJson, requireOrg } from "../../../../lib/auth/guards";
import { roles } from "../../../../lib/auth/org-access";
import { optStr, readJson } from "../../../../lib/api/body";
import { isReviewState, toAssetDto } from "../../../../lib/api/asset-dto";
import type { ReviewState } from "../../../../lib/api/dto";

export const prerender = false;

const NOTE_MAX_LEN = 2000;
const NAME_MAX_LEN = 120;

function notFound(): Response {
  return apiError("not_found", "That asset doesn't exist.", 404);
}

/**
 * Which permission a *transition into* a state requires.
 *
 * The gate is on the target state, not on the presence of the field: an
 * artist may submit their own work for review but must not be able to
 * approve it, and a reviewer may approve or reject but never submit. Both
 * roles hold `asset:update`, so checking that alone would let either do the
 * other's job — see src/lib/auth/org-access.ts.
 */
const REVIEW_PERMISSION: Record<ReviewState, { review: string[] } | null> = {
  draft: null,
  in_review: { review: ["submit"] },
  approved: { review: ["approve"] },
  changes_requested: { review: ["request-changes"] },
};

/** PATCH /api/v1/assets/:id — `{ name?, projectId?, reviewState?, reviewNote? }`. */
export async function PATCH(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { asset: ["update"] });
  if (org instanceof Response) return org;
  const id = context.params.id;
  if (!id) return notFound();

  const body = await readJson(context.request);
  if (!body) return apiError("bad_request", "Expected a JSON body.", 400);

  const patch: Partial<typeof asset.$inferInsert> = {};

  if ("name" in body) patch.name = optStr(body.name)?.slice(0, NAME_MAX_LEN) ?? null;
  if ("reviewNote" in body) patch.reviewNote = optStr(body.reviewNote)?.slice(0, NOTE_MAX_LEN) ?? null;

  const db = getDb(context);

  // `projectId: null` detaches the asset from its project without deleting
  // it, so presence of the key matters rather than truthiness of the value.
  if ("projectId" in body) {
    const projectId = optStr(body.projectId);
    if (projectId) {
      const owned = await db
        .select({ id: project.id })
        .from(project)
        .where(and(eq(project.id, projectId), eq(project.organizationId, org.orgId)))
        .limit(1);
      if (owned.length === 0) return apiError("not_found", "That project doesn't exist.", 404);
    }
    patch.projectId = projectId;
  }

  if ("reviewState" in body) {
    const next = body.reviewState;
    if (!isReviewState(next)) return apiError("bad_request", "Unknown `reviewState`.", 400);

    const required = REVIEW_PERMISSION[next];
    if (required) {
      // Checked locally against the role we already resolved, rather than a
      // second requireOrg round trip — same reasoning as guards.ts.
      const check = roles[org.role].authorize(required as Parameters<(typeof roles)["owner"]["authorize"]>[0]);
      if (!check.success) {
        return apiError("forbidden", "Your role doesn't allow that review action.", 403, {
          role: org.role,
          required,
        });
      }
    }

    patch.reviewState = next;
    // Only a decision (approve / request changes) records a reviewer.
    // Submitting for review or dropping back to draft is not a verdict, so
    // stamping reviewedBy there would misattribute the decision.
    if (next === "approved" || next === "changes_requested") {
      patch.reviewedBy = org.user.id;
      patch.reviewedAt = new Date();
    }
  }

  if (Object.keys(patch).length === 0) return apiError("bad_request", "Nothing to update.", 400);

  const updated = await db
    .update(asset)
    .set(patch)
    .where(and(eq(asset.id, id), eq(asset.organizationId, org.orgId)))
    .returning();

  const row = updated[0];
  if (!row) return notFound();

  // Touch the project so it sorts to the top of the projects list — review
  // activity is exactly the "recently worked on" signal that ordering means.
  if (row.projectId) {
    await db
      .update(project)
      .set({ updatedAt: new Date() })
      .where(and(eq(project.id, row.projectId), eq(project.organizationId, org.orgId)));
  }

  return apiJson({ asset: toAssetDto(row) });
}

/**
 * DELETE /api/v1/assets/:id — removes the row, not the image.
 *
 * The underlying PicX CDN URL stays live and public; nothing here can
 * un-publish it. See the note on `shareLink` in src/db/schema/product.ts.
 */
export async function DELETE(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { asset: ["delete"] });
  if (org instanceof Response) return org;
  const id = context.params.id;
  if (!id) return notFound();

  const db = getDb(context);
  const deleted = await db
    .delete(asset)
    .where(and(eq(asset.id, id), eq(asset.organizationId, org.orgId)))
    .returning({ id: asset.id });

  if (deleted.length === 0) return notFound();
  return apiJson({ ok: true });
}
