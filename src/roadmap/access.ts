/**
 * The roadmap board's three access tiers, and how they map onto tldraw sync's
 * two independent permission flags.
 *
 * This mapping is the whole security model of a publicly-writable canvas, so
 * it lives in one named place rather than inline in the connect route.
 *
 * The problem it solves: tldraw has no per-shape permissions. On a shared
 * document, anyone who can edit can select every shape and delete it — there is
 * no per-note ownership to fall back on. A roadmap wall that any signed-in
 * visitor can edit is therefore one careless Ctrl+A away from being erased.
 *
 * tldraw sync's object-store lane is the way out. `isReadonly` gates the
 * DOCUMENT (shapes), while `objectAccess` separately gates the LANE (comment
 * threads and reactions). Setting `isReadonly: true` with
 * `objectAccess: 'write'` produces exactly the tier this board needs: a signed-in
 * visitor can open a thread on any sticky and reply to it, but cannot move,
 * edit or delete the wall itself.
 */
import type { TLObjectStoreAccess } from "@tldraw/sync-core";

/** Who is allowed to do what on the roadmap board. */
export type RoadmapTier = "view" | "contribute" | "edit";

export interface RoadmapPermission {
  /** true = cannot change any shape on the document. */
  isReadonly: boolean;
  /** 'write' = may create/reply to comment threads. */
  objectAccess: TLObjectStoreAccess;
}

/**
 * What the sync room knows about the session performing a write.
 *
 * Carried as `meta` on the socket session so `authorizeRecord` can decide
 * ownership synchronously. It MUST be resolved server-side at connect time
 * (see the connect route): the authorizer runs inside the commit transaction
 * and is forbidden from doing I/O, so it cannot look a role up when it needs it.
 *
 * The consequence, stated plainly: a user demoted mid-session keeps edit rights
 * until they reconnect. That is an accepted trade for keeping the write path
 * synchronous; revoking immediately would require closing their sockets.
 */
export interface RoadmapSessionMeta {
  /** null for anonymous sessions, which are read-only anyway. */
  userId: string | null;
  isAdmin: boolean;
}

/**
 * Signed out -> read the wall, nothing else. Not even comments: an anonymous
 * write endpoint on a public board is a spam target, and we already have Google
 * sign-in, so the cost of requiring it is one click.
 *
 * Signed in -> add freely, and edit or delete WHAT YOU ADDED. This is not the
 * document-wide `isReadonly` gate doing the work — that is off for this tier.
 * Ownership is enforced per record by `authorizeRecord` in RoadmapRoom.ts, which
 * is what makes "contribute" safe: a contributor cannot touch a note they did
 * not create, nor the seeded board furniture, which has no author at all.
 *
 * Maintainer -> full edit, including other people's notes and the board's own
 * structure (columns, rules, headings). Triage is maintainer work.
 */
export const ROADMAP_PERMISSIONS: Record<RoadmapTier, RoadmapPermission> = {
  view: { isReadonly: true, objectAccess: "read" },
  contribute: { isReadonly: false, objectAccess: "write" },
  edit: { isReadonly: false, objectAccess: "write" },
};

/**
 * Resolve a tier from the caller's identity.
 *
 * `platformRole` is read from D1 by the caller rather than taken from the
 * session, matching the reasoning already documented in
 * src/lib/auth/admin-guard.ts: role is not a Better Auth session field, and a
 * demoted user must lose edit rights when they are demoted, not whenever their
 * 30-day session next refreshes.
 */
export function resolveTier(userId: string | null, platformRole: string | null): RoadmapTier {
  if (!userId) return "view";
  if (platformRole === "admin") return "edit";
  return "contribute";
}
