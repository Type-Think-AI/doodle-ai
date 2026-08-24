/* Threads, messages, generations, moodboards and characters.
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
 */
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const thread = sqliteTable(
  "thread",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Derived from the first message; TITLE_MAX_LEN is 48 on the client today. */
    title: text("title").notNull(),
    /** A skill pinned via "Install & run" on a skill detail page. */
    skillId: text("skill_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("thread_user_updated_idx").on(t.userId, t.updatedAt)],
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
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
  (t) => [index("generation_user_created_idx").on(t.userId, t.createdAt)],
);

/** The client caps the local moodboard at 24 items; server-side has no cap. */
export const moodboardItem = sqliteTable(
  "moodboard_item",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    generationId: text("generation_id").references(() => generation.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("moodboard_user_created_idx").on(t.userId, t.createdAt)],
);

/** A named, reusable reference photo — one photo per character, as on the client. */
export const character = sqliteTable(
  "character",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    imageUrl: text("image_url").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("character_user_created_idx").on(t.userId, t.createdAt)],
);
