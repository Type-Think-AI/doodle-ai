/**
 * Per-record write authorization for the roadmap board.
 *
 * This file is the entire difference between "only maintainers may touch the
 * board" and "anyone signed in may add to it". The document-wide `isReadonly`
 * flag is OFF for contributors (see access.ts), so these authorizers are the
 * only thing standing between a signed-in visitor and the DONE column. Treat
 * every function here as security code.
 *
 * How tldraw sync calls this (sync-core 5.3):
 *  - fires on create, update and delete, for the record types listed only;
 *  - fires ONLY for client pushes — `updateStore` and `loadSnapshot` from our
 *    own server code bypass it entirely, which is what lets the feedback
 *    endpoint drop a sticky onto the board regardless of who submitted it;
 *  - return the record to allow, `null` to reject;
 *  - on CREATE the returned record is what gets stored, so identity stamped
 *    here cannot be forged by the client — it overwrites whatever was sent;
 *  - runs synchronously inside the commit transaction: no I/O, no awaits.
 *
 * A rejection is silent by design: the write is skipped and the client
 * self-corrects, so the shape springs back to where it was. That is why the UI
 * needs to explain the rule — the transport will not.
 */
import type { TLRecordAuthorizers } from "@tldraw/sync-core";
import type { TLRecord } from "@tldraw/tlschema";
import type { RoadmapSessionMeta } from "./access";

/**
 * Key on a shape's `meta` holding the id of whoever created it.
 *
 * Two ways a shape ends up protected from contributors:
 *  - it was seeded by a maintainer, so its author is that maintainer, and every
 *    admin can still edit it because admins bypass the ownership check;
 *  - it was written server-side (e.g. the feedback endpoint via `updateStore`),
 *    which bypasses this authorizer entirely and therefore carries NO author —
 *    making it admin-only, since an absent author can never match a contributor.
 *
 * Either way the board's structure (column rules, headings, legend) is not
 * editable by a contributor, enforced by the same branch that protects other
 * people's notes rather than by a special case.
 */
const AUTHOR_KEY = "authorId";

function authorIdOf(record: { meta?: Record<string, unknown> }): string | null {
  const value = record.meta?.[AUTHOR_KEY];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * May this session modify (or delete) an already-existing record?
 *
 * Admins: yes, anything. Contributors: only records they created. Anonymous
 * sessions never reach here — they are read-only at the document level.
 */
function canMutateExisting(meta: RoadmapSessionMeta, prev: { meta?: Record<string, unknown> }): boolean {
  if (meta.isAdmin) return true;
  if (!meta.userId) return false;
  return authorIdOf(prev) === meta.userId;
}

/**
 * Authorizers for the roadmap document.
 *
 * Only the types listed here are checked; everything else writes through
 * untouched, which keeps this off the hot path for the vast majority of writes.
 */
export const roadmapAuthorizers: TLRecordAuthorizers<TLRecord, RoadmapSessionMeta> = {
  /**
   * Shapes are the board's content, so this is where ownership lives.
   *
   * Note the `isLocked` consequence: unlocking a seeded column rule is an
   * UPDATE on an unowned shape, so it is rejected for contributors by the same
   * branch that protects other people's notes. Locking composes with the
   * ownership rule instead of being decorative.
   */
  shape: ({ type, next, prev, session }) => {
    if (type === "create") {
      // Stamp the author server-side. The client's own meta is discarded for
      // this key, so ownership cannot be spoofed by a crafted push.
      const authorId = session.meta.userId;
      if (!authorId) return null;
      return { ...next, meta: { ...next.meta, [AUTHOR_KEY]: authorId } };
    }

    // update | delete — contents of the returned record are ignored, only
    // allow-vs-reject matters.
    if (!canMutateExisting(session.meta, prev)) return null;

    // Guard the stamp itself: a contributor must not be able to reassign
    // authorship (to themselves or anyone else) via an ordinary update.
    if (type === "update" && !session.meta.isAdmin) {
      if (authorIdOf(next) !== authorIdOf(prev)) return null;
    }

    return type === "delete" ? prev : next;
  },

  /**
   * Bindings attach arrows to shapes. They carry no author of their own, so
   * they follow the same create-freely / mutate-your-own rule via the shape
   * they belong to being ownership-checked separately. Creating one is allowed
   * for any writer; changing an existing one is owner-or-admin.
   */
  binding: ({ type, next, prev, session }) => {
    if (type === "create") return session.meta.userId ? next : null;
    if (!canMutateExisting(session.meta, prev)) return null;
    return type === "delete" ? prev : next;
  },

  /**
   * Pages are board STRUCTURE, not content. A contributor deleting or renaming
   * the page would take the whole roadmap with it, and there is no per-page
   * ownership to fall back on, so this is admin-only outright.
   */
  page: ({ type, next, prev, session }) => {
    if (!session.meta.isAdmin) return null;
    return type === "delete" ? prev : next;
  },

  /**
   * Document settings (grid, name, meta) are global board config — same
   * reasoning as pages.
   */
  document: ({ type, next, prev, session }) => {
    if (!session.meta.isAdmin) return null;
    return type === "delete" ? prev : next;
  },

  /**
   * Assets back uploaded images. Creating one is part of pasting a screenshot
   * onto your own note, so contributors may. Deleting one can orphan an image
   * on somebody else's shape, so that is admin-only.
   */
  asset: ({ type, next, prev, session }) => {
    if (type === "create") return session.meta.userId ? next : null;
    if (!session.meta.isAdmin) return null;
    return type === "delete" ? prev : next;
  },
};
