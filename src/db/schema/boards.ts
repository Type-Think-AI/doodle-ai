/* Boards — the single container primitive that replaces `project` + `asset`
 * and the flat `moodboard_item` bucket.
 *
 * WHY THIS EXISTS
 *
 * `project`/`asset` modelled an agency review pipeline (brief -> deliverable ->
 * review state -> client link). It shipped with no intake path: the only way to
 * add work was pasting a CDN URL into a text field on /projects/[id], so the
 * container could never fill through normal use and the review workflow was
 * never exercised by a real user. `moodboard_item` was the opposite — it filled
 * automatically and got used, but it is one flat unnamed bucket per user with no
 * naming, grouping, arrangement or sharing.
 *
 * A board is both: it fills automatically (the `inbox` board receives every
 * generation, exactly as the moodboard did) and it can be named, arranged and
 * shared. Generation targets a board directly, which is the whole fix.
 *
 * ORG SCOPING
 *
 * Unlike the older product tables, `organizationId` here is NOT NULL. That is
 * safe because these are brand-new tables — the nullable-forever constraint
 * described in product.ts's header only applies to columns ADDED to live
 * tables, which D1 cannot promote to NOT NULL without a full rebuild.
 *
 * Boards are org-scoped for sharing and credit attribution, but `createdBy` is
 * the owner for permission purposes. A personal org is auto-created on signup
 * (see requireOrg in src/lib/auth/guards.ts), so for a solo creator org-scoped
 * and personal are the same thing.
 */
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organization, user } from "./auth";
import { character, generation } from "./product";

/** Board kinds. `inbox` is the undeletable system board that auto-receives generations. */
export const BOARD_KINDS = ["inbox", "custom"] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];

/** Which lens the board opens in. Persisted per board, not per device — the
 *  choice is a property of the board's content (a 500-item inbox is a bad
 *  canvas; an arranged moodboard is a bad grid). */
export const BOARD_VIEW_MODES = ["grid", "canvas"] as const;
export type BoardViewMode = (typeof BOARD_VIEW_MODES)[number];

/**
 * Collaborator roles, mapped onto tldraw sync's two independent permission
 * flags in src/lib/boards/access.ts.
 *
 * `comment` is the tier the roadmap board documented but never instantiated:
 * `isReadonly: true` with `objectAccess: 'write'` lets someone open a comment
 * thread on any item without being able to move or delete a single shape.
 */
export const BOARD_ROLES = ["view", "comment", "edit"] as const;
export type BoardRole = (typeof BOARD_ROLES)[number];

/**
 * A named collection of doodles.
 *
 * There is deliberately no `status`, no `brief` and no review state. Those were
 * the project model's vocabulary and none of them survived contact with a real
 * creator. `description` is a plain note to self, nothing branches on it.
 *
 * INBOX UNIQUENESS is enforced in application code (get-or-create), not by a
 * partial unique index. Drizzle's SQLite partial-index support is not something
 * to bet a migration on, and the codebase already has the precedent: requireOrg
 * self-heals a missing organization rather than relying on a DB constraint.
 */
export const board = sqliteTable(
  "board",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Owner. Full rights on the board including structure and deletion. */
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    name: text("name").notNull(),
    description: text("description"),
    kind: text("kind").notNull().default("custom"),
    viewMode: text("view_mode").notNull().default("grid"),
    /** Soft-archive so a shared link does not 404 the moment an owner tidies up. */
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    /** Bumped on item add/remove so /boards can order by recency of activity. */
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("board_org_updated_idx").on(t.organizationId, t.updatedAt),
    /** Serves the get-or-create inbox lookup and the owner's board list. */
    index("board_owner_kind_idx").on(t.createdBy, t.kind),
  ],
);

/**
 * One image on a board.
 *
 * `url` is always a PicX CDN URL (generation output) or an R2-backed upload —
 * this app never hosts image bytes itself. Generated doodles therefore need no
 * R2 write at all; only user-uploaded references do.
 *
 * `unique(boardId, url)` mirrors the dedupe already in /api/v1/moodboard: the
 * chat re-renders a thread's full history on every load and auto-saves each
 * image, so without this a revisited thread would refill the board with
 * duplicates of its own output.
 */
export const boardItem = sqliteTable(
  "board_item",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => board.id, { onDelete: "cascade" }),
    /** Denormalised from the parent board so share-link authorisation and
     *  org-wide queries do not need a join on the hot read path. */
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** 'generation' | 'reference' | 'upload' */
    kind: text("kind").notNull().default("generation"),
    generationId: text("generation_id").references(() => generation.id, { onDelete: "set null" }),
    /** Set when the item was placed as a reusable character reference. */
    characterId: text("character_id").references(() => character.id, { onDelete: "set null" }),
    note: text("note"),
    /**
     * Fractional index (e.g. "a0", "a0V") for manual ordering.
     *
     * Text rather than an integer position so dragging one item between two
     * others is a single-row UPDATE instead of renumbering every sibling —
     * which on D1, with no transactions worth relying on, would be a
     * partial-write hazard on every reorder.
     */
    sortKey: text("sort_key").notNull(),
    /** Intrinsic dimensions, recorded at insert. Lets the grid reserve exact
     *  aspect-ratio space and keeps CLS at zero without a layout probe. */
    width: integer("width"),
    height: integer("height"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("board_item_board_sort_idx").on(t.boardId, t.sortKey),
    index("board_item_board_created_idx").on(t.boardId, t.createdAt),
    index("board_item_org_created_idx").on(t.organizationId, t.createdAt),
    uniqueIndex("board_item_board_url_unique").on(t.boardId, t.url),
  ],
);

/**
 * An explicitly invited collaborator on one board.
 *
 * This is what replaces the team workspace. Collaboration for this audience is
 * per-artifact and ad-hoc — a client, a contractor hired for one job — not a
 * seat in a persistent org. The org layer stays underneath as credit plumbing
 * and is no longer a user-facing concept.
 *
 * Anonymous link-holders are NOT rows here; they are resolved from `share_link`
 * and carry that link's role.
 */
export const boardMember = sqliteTable(
  "board_member",
  {
    boardId: text("board_id")
      .notNull()
      .references(() => board.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** One of BOARD_ROLES. */
    role: text("role").notNull().default("view"),
    invitedBy: text("invited_by").references(() => user.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.boardId, t.userId] }),
    /** "which boards am I a guest on" — drives the shared section of /boards. */
    index("board_member_user_idx").on(t.userId),
  ],
);
