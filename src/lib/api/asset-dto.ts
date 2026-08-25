/* The `asset` -> AssetDto mapper.
 *
 * Deviation from the colocate-the-mapper convention used by threads.ts /
 * characters.ts: the two routes that need this live at
 * `projects/[id]/assets.ts` and `assets/[id].ts`, so colocating would mean
 * one of them importing the other through a path containing `[` and `]`.
 * A three-line shared module is the less surprising option.
 */
import type { asset } from "../../db/schema/product";
import type { AssetDto, AssetKind, ReviewState } from "./dto";

const KINDS: AssetKind[] = ["generation", "reference", "upload"];
export const REVIEW_STATES: ReviewState[] = ["draft", "in_review", "changes_requested", "approved"];

export function isAssetKind(value: unknown): value is AssetKind {
  return typeof value === "string" && (KINDS as string[]).includes(value);
}

export function isReviewState(value: unknown): value is ReviewState {
  return typeof value === "string" && (REVIEW_STATES as string[]).includes(value);
}

export function toAssetDto(row: typeof asset.$inferSelect): AssetDto {
  return {
    id: row.id,
    url: row.url,
    kind: isAssetKind(row.kind) ? row.kind : "upload",
    name: row.name,
    projectId: row.projectId,
    reviewState: isReviewState(row.reviewState) ? row.reviewState : "draft",
    reviewNote: row.reviewNote,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt?.getTime() ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.getTime(),
  };
}
