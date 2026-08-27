/**
 * Per-record write authorization for board canvases.
 *
 * Cloned from src/roadmap/authorize.ts with one semantic change:
 * roadmap keyed admin status on `platformRole === 'admin'` (a site-wide role);
 * boards key it on `isOwner` (the board's `createdBy`). This means:
 *
 *   - Board owner can edit/delete any shape on their board.
 *   - Members with 'edit' role can create freely but only update/delete shapes
 *     they themselves created.
 *   - Members with 'comment' or 'view' never reach here — they are read-only
 *     at the document level.
 *
 * The same bypass applies: `updateStore` and `loadSnapshot` (server-side writes)
 * skip these authorizers entirely. That is what makes drop-item.ts possible —
 * a finished generation lands on the canvas without needing to impersonate a user.
 *
 * Treat every function here as security code.
 */
import type { TLRecordAuthorizers } from "@tldraw/sync-core";
import type { TLRecord } from "@tldraw/tlschema";
import type { BoardSessionMeta } from "./access";

/** Key on a shape's `meta` holding the id of whoever created it. */
const AUTHOR_KEY = "authorId";

function authorIdOf(record: { meta?: Record<string, unknown> }): string | null {
  const value = record.meta?.[AUTHOR_KEY];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * May this session modify (or delete) an already-existing record?
 *
 * Board owner: yes, anything. Editor: only records they created. Anonymous/
 * comment/view sessions never reach here (read-only at document level).
 */
function canMutateExisting(meta: BoardSessionMeta, prev: { meta?: Record<string, unknown> }): boolean {
  if (meta.isOwner) return true;
  if (!meta.userId) return false;
  return authorIdOf(prev) === meta.userId;
}

/**
 * Authorizers for board documents.
 *
 * Only types listed here are checked; everything else writes through.
 */
export const boardAuthorizers: TLRecordAuthorizers<TLRecord, BoardSessionMeta> = {
  /**
   * Shapes: the board's content. Ownership is stamped server-side on create
   * so it cannot be spoofed by a crafted client push.
   */
  shape: ({ type, next, prev, session }) => {
    if (type === "create") {
      // Stamp author server-side. The client's meta for this key is discarded.
      const authorId = session.meta.userId;
      if (!authorId) return null; // anonymous cannot create shapes
      return { ...next, meta: { ...next.meta, [AUTHOR_KEY]: authorId } };
    }

    // update | delete
    if (!canMutateExisting(session.meta, prev)) return null;

    // Guard the stamp: a non-owner editor must not reassign authorship.
    if (type === "update" && !session.meta.isOwner) {
      if (authorIdOf(next) !== authorIdOf(prev)) return null;
    }

    return type === "delete" ? prev : next;
  },

  /**
   * Bindings (arrows connecting shapes). Creating is allowed for any
   * authenticated writer; mutating existing follows ownership.
   */
  binding: ({ type, next, prev, session }) => {
    if (type === "create") return session.meta.userId ? next : null;
    if (!canMutateExisting(session.meta, prev)) return null;
    return type === "delete" ? prev : next;
  },

  /**
   * Pages are board STRUCTURE — only the board owner may create/rename/delete.
   * An editor deleting the page takes the whole canvas with it.
   */
  page: ({ type, next, prev, session }) => {
    if (!session.meta.isOwner) return null;
    return type === "delete" ? prev : next;
  },

  /**
   * Document settings (grid, name, meta) — owner-only, same as pages.
   */
  document: ({ type, next, prev, session }) => {
    if (!session.meta.isOwner) return null;
    return type === "delete" ? prev : next;
  },

  /**
   * Assets back uploaded images. Creating is part of pasting/dropping an image,
   * so editors may. Deleting can orphan another user's shape, so owner-only.
   */
  asset: ({ type, next, prev, session }) => {
    if (type === "create") return session.meta.userId ? next : null;
    if (!session.meta.isOwner) return null;
    return type === "delete" ? prev : next;
  },
};
