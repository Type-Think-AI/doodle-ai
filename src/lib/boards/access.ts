/**
 * Board access resolution — maps a caller's relationship to a board onto a
 * concrete permission tier and the tldraw sync flags that enforce it.
 *
 * This file is the single source of truth for "who can do what on a board",
 * mirroring src/roadmap/access.ts in reasoning and comment style but extended
 * for per-board collaborators and share-link bearers.
 *
 * TIER MAPPING
 *
 *   owner   — created the board. Full CRUD including deletion and structure.
 *             isReadonly: false, objectAccess: 'write'.
 *
 *   edit    — explicit boardMember with role='edit'. Can add, move, reorder,
 *             and delete items, and comment. Cannot rename or delete the board.
 *             isReadonly: false, objectAccess: 'write'.
 *
 *   comment — explicit boardMember with role='comment', OR a share-link holder
 *             with allowComments=true. Can open comment threads and reply, but
 *             cannot move, add, or delete items.
 *             isReadonly: true, objectAccess: 'write'.
 *
 *   view    — explicit boardMember with role='view', OR a share-link holder
 *             with allowComments=false. Read-only, no interaction.
 *             isReadonly: true, objectAccess: 'read'.
 *
 *   null    — not the owner, not a member, no valid share link. Reject.
 *
 * Resolution order mirrors the principle of least surprise:
 *   1. Owner check (createdBy == userId) — always wins.
 *   2. Explicit membership row — takes priority over anonymous links.
 *   3. Share-link role — the fallback for unauthenticated or non-member
 *      authenticated callers arriving via /s/:token.
 *
 * The consequence, stated plainly: an authenticated user who is BOTH a member
 * AND arrives via a share link gets whichever tier is HIGHER. This matches user
 * expectation ("I was invited as editor, why would the link downgrade me?").
 */
import type { TLObjectStoreAccess } from "@tldraw/sync-core";
import type { BoardRole } from "../../db/schema/boards";

export type BoardTier = "owner" | "edit" | "comment" | "view";

export interface BoardPermission {
  /** true = cannot change any shape/item on the document. */
  isReadonly: boolean;
  /** 'write' = may create/reply to comment threads; 'read' = view only. */
  objectAccess: TLObjectStoreAccess;
}

export const BOARD_PERMISSIONS: Record<BoardTier, BoardPermission> = {
  owner: { isReadonly: false, objectAccess: "write" },
  edit: { isReadonly: false, objectAccess: "write" },
  comment: { isReadonly: true, objectAccess: "write" },
  view: { isReadonly: true, objectAccess: "read" },
};

/** Rank for "take the higher tier" logic. */
const TIER_RANK: Record<BoardTier, number> = { owner: 4, edit: 3, comment: 2, view: 1 };

function higher(a: BoardTier | null, b: BoardTier | null): BoardTier | null {
  if (!a) return b;
  if (!b) return a;
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

/** Map a boardMember.role string to a BoardTier. */
function memberRoleToTier(role: BoardRole): BoardTier {
  // Direct 1:1 mapping — the schema roles ARE the tiers minus 'owner'.
  return role as BoardTier;
}

/**
 * Resolve the effective board tier for a caller.
 *
 * @param boardCreatedBy  The user id of the board's owner.
 * @param userId          The authenticated caller, or null for anonymous.
 * @param memberRole      The caller's boardMember.role if they have a row, or null.
 * @param shareLinkRole   The role granted by a share link the caller arrived via, or null.
 *                        Comes from the shareLink row's allowComments: true -> 'comment', false -> 'view'.
 */
export function resolveBoardRole(
  boardCreatedBy: string,
  userId: string | null,
  memberRole: BoardRole | null,
  shareLinkRole: "comment" | "view" | null,
): BoardTier | null {
  // 1. Owner — always the highest tier.
  if (userId && userId === boardCreatedBy) return "owner";

  // 2. Explicit membership.
  const fromMember: BoardTier | null = memberRole ? memberRoleToTier(memberRole) : null;

  // 3. Share-link (maps directly to a tier name).
  const fromLink: BoardTier | null = shareLinkRole;

  // Take the higher of the two — an invited editor arriving via a view-only
  // link should not be downgraded.
  return higher(fromMember, fromLink);
}

/**
 * Minimum tier required for common write operations.
 * Used by the route layer to gate actions after resolving the caller's tier.
 */
export const REQUIRED_TIER = {
  /** Add, reorder, move, or delete items. */
  mutateItems: "edit" as BoardTier,
  /** Rename, change viewMode, archive the board. */
  mutateBoard: "owner" as BoardTier,
  /** Delete the board entirely. */
  deleteBoard: "owner" as BoardTier,
  /** Create or revoke share links. */
  manageSharing: "owner" as BoardTier,
  /** Manage board members. */
  manageMembers: "owner" as BoardTier,
} as const;

/** Returns true if `actual` is at least as powerful as `required`. */
export function hasTier(actual: BoardTier | null, required: BoardTier): boolean {
  if (!actual) return false;
  return TIER_RANK[actual] >= TIER_RANK[required];
}
