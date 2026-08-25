/* Threads, messages, generations, moodboards, characters, projects, and
 * shared team assets.
 *
 * These mirror the existing localStorage shapes one-for-one so the Phase 3
 * import (`POST /api/v1/import`) is a straight field mapping rather than a
 * transformation:
 *   thread         <- ThreadSummary   (src/scripts/app/chat-store.ts)
 *   message        <- ChatMessage     (src/scripts/app/chat-store.ts)
 *   moodboardItem  <- MoodboardItem   (src/scripts/app/moodboard.ts)
 *   character      <- Character       (src/scripts/app/character-store.ts)
 *
 * Deliberately *not* mirrored: doodleai-style-theme, the colour theme, and
 * sidebar-collapsed. Those are per-device UI preferences, not user data, and
 * stay in localStorage.
 *
 * B2B TEAM LAYER NOTE — organizationId columns:
 *
 * Every `organizationId` column added below is NULLABLE, and stays that way
 * forever. SQLite/D1 cannot add a NOT NULL column without a default, and
 * cannot promote a nullable column to NOT NULL without a full table rebuild
 * — not something to do to a live product table with no transactions. The
 * invariant that every *new* row always has one is enforced entirely in
 * application code: `requireOrg()` (src/lib/auth/guards.ts) always resolves
 * an organization before any write path runs, self-healing one into
 * existence if a user somehow has none. `reconcile.ts`'s hourly sweep
 * treats any row it finds with a NULL organizationId as a bug to log and
 * repair, not a legitimate state — see that file. Do not "fix" these to
 * NOT NULL; there is nothing to fix, and it isn't safely doable anyway.
 *
 * Image-table taxonomy (deliberately three separate tables, not unified —
 * see the plan for why):
 *   - `character`     -> shared named references ("References" in the UI).
 *                        Org-scoping makes it shared for free.
 *   - `moodboardItem`  -> shared scratch inspiration board. Same reasoning.
 *   - `asset`          -> project deliverables with a review workflow. The
 *                        only genuinely new surface.
 */
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organization, user } from "./auth";

export const thread = sqliteTable(
  "thread",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Nullable forever — see the file header. Set by requireOrg() on every write. */
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
    projectId: text("project_id").references(() => project.id, { onDelete: "set null" }),
    /**
     * Stays "New chat" until the thread's first successful generation, at
     * which point it becomes that skill's friendly display name (e.g.
     * "Doodle Avatar") rather than the raw first user message — the earlier
     * behavior could put an arbitrary prompt, or a pasted JSON/URL, in front
     * of a non-technical user as if it were a label.
     */
    title: text("title").notNull(),
    /** A skill pinned via "Install & run" on a skill detail page. */
    skillId: text("skill_id"),
    /**
     * The thread's first successful generation's image URL — set once and
     * never overwritten, so the sidebar's thumbnail for a chat stays stable
     * rather than jumping to whatever was generated most recently in it.
     */
    thumbnailUrl: text("thumbnail_url"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("thread_user_updated_idx").on(t.userId, t.updatedAt),
    index("thread_org_updated_idx").on(t.organizationId, t.updatedAt),
  ],
);

export const message = sqliteTable(
  "message",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => thread.id, { onDelete: "cascade" }),
    /** 'user' | 'assistant' */
    role: text("role").notNull(),
    content: text("content").notNull(),
    /** The attached photo or the generated doodle, depending on `role`. */
    imageUrl: text("image_url"),
    /** A #-mentioned moodboard image, sent as an extra style/composition reference. */
    refImageUrl: text("ref_image_url"),
    /** Multi-image results (e.g. the sticker-pack skill). */
    images: text("images", { mode: "json" }).$type<string[]>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("message_thread_created_idx").on(t.threadId, t.createdAt)],
);

/**
 * One row per generation attempt, created *before* PicX is called so a
 * crash mid-flight leaves a `pending` row the reconciliation job can refund.
 * `creditsCharged` records what was actually debited, not what the skill's
 * list price was at read time — prices can change.
 */
export const generation = sqliteTable(
  "generation",
  {
    id: text("id").primaryKey(),
    /** The acting member — who ran this generation. Always a real user. */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Nullable forever — see the file header. */
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
    projectId: text("project_id").references(() => project.id, { onDelete: "set null" }),
    threadId: text("thread_id").references(() => thread.id, { onDelete: "set null" }),
    /** One of GENERATION_MODES in src/lib/doodle-constants.ts. */
    skillId: text("skill_id").notNull(),
    /** A THEMES id from src/lib/doodle-constants.ts. */
    styleId: text("style_id"),
    prompt: text("prompt").notNull(),
    /** PicX CDN URL from /api/upload — the subject photo. */
    sourceAssetUrl: text("source_asset_url"),
    refAssetUrl: text("ref_asset_url"),
    outputUrl: text("output_url"),
    creditsCharged: integer("credits_charged").notNull(),
    /** 'pending' | 'ok' | 'failed' | 'refunded' */
    status: text("status").notNull(),
    errorCode: text("error_code"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("generation_user_created_idx").on(t.userId, t.createdAt),
    index("generation_org_created_idx").on(t.organizationId, t.createdAt),
    index("generation_project_created_idx").on(t.projectId, t.createdAt),
  ],
);

/** The client caps the local moodboard at 24 items; server-side has no cap. */
export const moodboardItem = sqliteTable(
  "moodboard_item",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Nullable forever — see the file header. Shared team scratch board once set. */
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
    url: text("url").notNull(),
    generationId: text("generation_id").references(() => generation.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("moodboard_user_created_idx").on(t.userId, t.createdAt),
    index("moodboard_org_created_idx").on(t.organizationId, t.createdAt),
  ],
);

/** Freeform feedback submitted via the feedback dialog — triaged in /admin/feedback. */
export const feedback = sqliteTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Nullable forever — see the file header. Lets support triage per account. */
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
    text: text("text").notNull(),
    /**
     * Triage state, driven by PATCH /api/admin/feedback/:id.
     * 'new' | 'reviewing' | 'resolved' | 'wont_fix'
     *
     * Defaults to 'new' so every historical row (written before this column
     * existed) reads as untriaged rather than NULL — which is correct: none
     * of them have been triaged, because there was no UI to do it with.
     */
    status: text("status").notNull().default("new"),
    /** Set when status last moved away from 'new'. Null while untriaged. */
    triagedBy: text("triaged_by").references(() => user.id, { onDelete: "set null" }),
    triagedAt: integer("triaged_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("feedback_user_created_idx").on(t.userId, t.createdAt),
    index("feedback_status_created_idx").on(t.status, t.createdAt),
  ],
);

/**
 * Admin-controlled presentation state for a skill.
 *
 * Skills themselves are authored as `SKILL.md` packages and bundled at build
 * time (see src/lib/skill-loader.ts) — that stays the source of truth for
 * what a skill *is*. This table holds only the parts an admin flips at
 * runtime without a redeploy: whether it's featured, and whether it's
 * currently accepting runs.
 *
 * A skill with no row here is treated as `state: 'live', featured: false`,
 * so this table starts empty and only grows when someone actually changes
 * something. `skillId` matches a GENERATION_MODES id.
 */
export const skillState = sqliteTable("skill_state", {
  skillId: text("skill_id").primaryKey(),
  /** 'live' | 'paused' — paused skills are hidden from the composer and refuse new runs. */
  state: text("state").notNull().default("live"),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  /** Shown in the admin UI as the reason a skill is paused. */
  note: text("note"),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * A named, reusable reference photo — one photo per character, as on the
 * client. Org-scoped, this becomes the team's shared "References" library
 * (see the taxonomy note in the file header); the table and UI name stay
 * "character" / "Characters" for `/characters` and get a "References" label
 * anywhere team-scoped.
 */
export const character = sqliteTable(
  "character",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Nullable forever — see the file header. */
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    imageUrl: text("image_url").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("character_user_created_idx").on(t.userId, t.createdAt),
    index("character_org_created_idx").on(t.organizationId, t.createdAt),
  ],
);

/**
 * A production project: a brief, a client, a bounded set of generations and
 * assets, moving through review to a client share link. The unit the B2B
 * product actually sells (marketing/b2b.md's "Concept Sprint" / "Campaign
 * Visual Pack").
 */
export const project = sqliteTable(
  "project",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    brief: text("brief"),
    /** 'active' | 'archived' */
    status: text("status").notNull().default("active"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("project_org_updated_idx").on(t.organizationId, t.updatedAt)],
);

/**
 * A project deliverable moving through review. `url` is always a PicX CDN
 * URL (generation output) or an uploaded reference — we never host bytes,
 * see docs/tech-stack.md. `unique(organizationId, url)` mirrors the same
 * dedupe already used by /api/v1/moodboard so re-adding the same image is a
 * no-op, not a duplicate row.
 */
export const asset = sqliteTable(
  "asset",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => project.id, { onDelete: "set null" }),
    url: text("url").notNull(),
    /** 'generation' | 'reference' | 'upload' */
    kind: text("kind").notNull(),
    generationId: text("generation_id").references(() => generation.id, { onDelete: "set null" }),
    name: text("name"),
    /** 'draft' | 'in_review' | 'changes_requested' | 'approved' */
    reviewState: text("review_state").notNull().default("draft"),
    reviewNote: text("review_note"),
    reviewedBy: text("reviewed_by").references(() => user.id),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("asset_org_created_idx").on(t.organizationId, t.createdAt),
    index("asset_project_review_idx").on(t.projectId, t.reviewState),
    uniqueIndex("asset_org_url_unique").on(t.organizationId, t.url),
  ],
);

/**
 * An unauthenticated, revocable read-only link for client review. Revoking
 * this row stops the *link* from resolving — it does NOT un-publish the
 * underlying PicX CDN URLs, which are permanent and unguessable but public
 * by construction. Say that plainly in the share UI; see the plan's risks
 * section.
 */
export const shareLink = sqliteTable(
  "share_link",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => project.id, { onDelete: "cascade" }),
    assetId: text("asset_id").references(() => asset.id, { onDelete: "cascade" }),
    /** 'project' | 'asset' */
    scope: text("scope").notNull(),
    allowComments: integer("allow_comments", { mode: "boolean" }).notNull().default(false),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("share_link_org_created_idx").on(t.organizationId, t.createdAt)],
);

/**
 * A batch/variant generation run. Credits for `variantCount * cost` are
 * reserved up front with a single `spend()` keyed `batch:<jobId>`, then
 * fanned out via `ctx.waitUntil()` — see src/lib/batch/run.ts. No queue
 * infrastructure exists in this stack yet; the hourly cron sweep
 * (src/lib/batch/sweep.ts) resumes or refunds anything left `running` too
 * long, which is the honest answer to `waitUntil` having no delivery
 * guarantee.
 */
export const batchJob = sqliteTable(
  "batch_job",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => project.id, { onDelete: "set null" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    /** One of GENERATION_MODES in src/lib/doodle-constants.ts. */
    skillId: text("skill_id").notNull(),
    styleId: text("style_id"),
    description: text("description"),
    sourceAssetUrl: text("source_asset_url"),
    refAssetUrl: text("ref_asset_url"),
    variantCount: integer("variant_count").notNull(),
    /** 'queued' | 'running' | 'done' | 'failed' | 'canceled' */
    status: text("status").notNull().default("queued"),
    creditsReserved: integer("credits_reserved").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("batch_job_org_created_idx").on(t.organizationId, t.createdAt)],
);

export const batchItem = sqliteTable(
  "batch_item",
  {
    id: text("id").primaryKey(),
    batchJobId: text("batch_job_id")
      .notNull()
      .references(() => batchJob.id, { onDelete: "cascade" }),
    /** Position within the batch, 0-based — stable ordering for the poll UI. */
    idx: integer("idx").notNull(),
    /**
     * 'queued' | 'running' | 'ok' | 'failed' | 'canceled'. The UPDATE that
     * flips 'queued' -> 'running' IS the claim/lock (src/lib/batch/run.ts)
     * — safe because D1 has one writer, same argument as credits/index.ts.
     */
    status: text("status").notNull().default("queued"),
    generationId: text("generation_id").references(() => generation.id, { onDelete: "set null" }),
    /**
     * PicX's generation id, from the 202 accepted body. Set only on the async
     * path; this is what the webhook receiver correlates a delivery on, because
     * the delivery payload names the work in PicX's id namespace rather than
     * ours. See migrations/0010 for why correlation is not done on the callback
     * URL path instead.
     */
    picxGenerationId: text("picx_generation_id"),
    /**
     * The prompt actually sent to PicX, captured at submit time on the async
     * path. The webhook writes the `generation` row and cannot reconstruct this:
     * the prompt builders randomize per call, so rebuilding would record text
     * that never produced the image. See migrations/0010.
     */
    prompt: text("prompt"),
    outputUrl: text("output_url"),
    errorCode: text("error_code"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("batch_item_job_idx_idx").on(t.batchJobId, t.idx),
    index("batch_item_picx_generation_id_idx").on(t.picxGenerationId),
  ],
);
