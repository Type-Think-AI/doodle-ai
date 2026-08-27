/**
 * Per-board access tiers, mapped onto tldraw sync's two independent permission
 * flags: `isReadonly` (document shapes) and `objectAccess` (comment lane).
 *
 * Three tiers:
 *
 *   view    — read the canvas, cannot comment or edit.
 *   comment — read the canvas AND open/reply to comment threads, but cannot
 *             move, create, or delete any shape. This is the tier roadmap
 *             documented but never instantiated; boards instantiate it for
 *             share-link viewers with `allowComments: true`.
 *   edit    — full write access, including shapes and comments.
 *
 * The ownership authorizer (authorize.ts) further restricts *edit* tier:
 * editors may create freely but can only update/delete shapes they authored,
 * unless they are the board owner.
 */
import type { TLObjectStoreAccess } from "@tldraw/sync-core";

export type BoardTier = "view" | "comment" | "edit";

export interface BoardPermission {
  /** true = cannot change any shape on the document. */
  isReadonly: boolean;
  /** 'write' = may create/reply to comment threads. */
  objectAccess: TLObjectStoreAccess;
}

/**
 * What the sync room knows about the session performing a write.
 *
 * Resolved at connect time in the API route; the DO never re-derives it.
 * A user demoted mid-session keeps their rights until they reconnect —
 * acceptable trade for keeping the write path synchronous.
 */
export interface BoardSessionMeta {
  /** null for anonymous / share-link sessions with no authenticated user. */
  userId: string | null;
  /** true only for the board's `createdBy` user — the board owner. */
  isOwner: boolean;
}

/**
 * The tier -> permission mapping.
 *
 *   view:    cannot touch the document or the comment lane.
 *   comment: cannot touch shapes, CAN write comments (isReadonly:true +
 *            objectAccess:'write'). This is the combination that tldraw sync
 *            was designed to support but the roadmap never used.
 *   edit:    full write on both lanes, subject to per-record ownership.
 */
export const BOARD_PERMISSIONS: Record<BoardTier, BoardPermission> = {
  view: { isReadonly: true, objectAccess: "read" },
  comment: { isReadonly: true, objectAccess: "write" },
  edit: { isReadonly: false, objectAccess: "write" },
};

/**
 * Resolve a tier from the caller's relationship to the board.
 *
 * @param isOwner     - true if the caller is the board's `createdBy`
 * @param memberRole  - the `board_member.role` value, or null if not a member
 * @param shareLinkRole - the share_link's implied role, or null if no link
 *
 * Priority: owner > explicit member > share link > unauthenticated.
 * The board owner always gets 'edit', regardless of any other signal.
 */
export function resolveBoardTier(
  isOwner: boolean,
  memberRole: string | null,
  shareLinkRole: string | null,
): BoardTier {
  if (isOwner) return "edit";

  // Explicit membership takes priority over a share link the same user might
  // also have in their URL (belt and suspenders).
  if (memberRole === "edit") return "edit";
  if (memberRole === "comment") return "comment";
  if (memberRole === "view") return "view";

  // Share link fallback (anonymous or authenticated user arriving via link).
  if (shareLinkRole === "edit") return "edit";
  if (shareLinkRole === "comment") return "comment";
  if (shareLinkRole === "view") return "view";

  // No relationship to this board whatsoever. The connect route returns 404
  // before reaching here, but be defensive.
  return "view";
}
