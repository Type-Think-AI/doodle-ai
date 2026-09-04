/* Search-index tracking behind /admin/seo.
 *
 * See migrations/0019_seo_index.sql for why this is three tables rather than
 * one, and in particular why "we pushed it" (seo_submission) and "the engine
 * indexed it" (seoIndexState) are deliberately kept apart.
 */

import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";

/** Engines we can push to. `bing` (SubmitUrlBatch) is not wired up yet. */
export type SeoSubmitEngine = "indexnow" | "bing";

/** Engines we can read an index verdict from. */
export type SeoStatusEngine = "google" | "bing";

/** Normalised verdicts, so one pill column can describe both engines. */
export type SeoVerdict =
  | "indexed"
  | "not_indexed"
  | "crawled_not_indexed"
  | "duplicate"
  | "excluded"
  | "error";

export const seoUrl = sqliteTable(
  "seo_url",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Root-relative with a trailing slash, e.g. "/doodle-ideas/". */
    path: text("path").notNull().unique(),
    title: text("title"),
    /** 'sitemap' | 'manual' — a manual row is not reconciled away by discovery. */
    source: text("source").notNull().default("sitemap"),
    changefreq: text("changefreq"),
    priority: text("priority"),
    /** Drives re-submission: only pushed again when this moves past the last push. */
    contentLastmod: integer("content_lastmod", { mode: "timestamp_ms" }),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
    /** Non-null once the path leaves the page list. Never deletes the row. */
    removedAt: integer("removed_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("seo_url_removed_lastmod_idx").on(t.removedAt, t.contentLastmod)],
);

export const seoSubmission = sqliteTable(
  "seo_submission",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    urlId: integer("url_id").notNull(),
    engine: text("engine").notNull(),
    /** Groups one sync run. */
    batchId: text("batch_id").notNull(),
    /** 'manual' | 'cron'. */
    trigger: text("trigger").notNull(),
    statusCode: integer("status_code"),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    error: text("error"),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("seo_submission_url_engine_idx").on(t.urlId, t.engine, t.submittedAt),
    index("seo_submission_batch_idx").on(t.batchId),
  ],
);

export const seoIndexState = sqliteTable(
  "seo_index_state",
  {
    urlId: integer("url_id").notNull(),
    engine: text("engine").notNull(),
    verdict: text("verdict").notNull(),
    /** The engine's own wording, kept beside our normalisation. */
    coverageState: text("coverage_state"),
    lastCrawledAt: integer("last_crawled_at", { mode: "timestamp_ms" }),
    robotsState: text("robots_state"),
    canonical: text("canonical"),
    checkedAt: integer("checked_at", { mode: "timestamp_ms" }).notNull(),
    raw: text("raw"),
  },
  (t) => [primaryKey({ columns: [t.urlId, t.engine] })],
);
