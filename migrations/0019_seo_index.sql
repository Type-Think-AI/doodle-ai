-- Search-index tracking behind /admin/seo.
--
-- Three tables, because the three things being recorded have genuinely
-- different lifetimes and it is a mistake to collapse them into one row:
--
--   seo_url          the page inventory        — one row per path, long-lived
--   seo_submission   what we PUSHED            — append-only, one row per push
--   seo_index_state  what the engine SAYS      — one row per (url, engine), overwritten
--
-- Folding submissions into seo_url would destroy the history that answers the
-- only question worth asking when a page will not index ("did we ever actually
-- tell them about it, and what did they say?"). Folding index state in would
-- mean a re-check silently overwrites the push log.
--
-- IMPORTANT, and the reason the two push/state tables are separate:
-- SUBMITTING IS NOT INDEXING. IndexNow returning 200 means the search engine
-- received the URL, nothing more (https://www.indexnow.org/documentation).
-- Whether it indexed is a different fact from a different endpoint, so it is a
-- different table. Conflating them would let the UI paint a page green because
-- we sent it, which is exactly the false comfort this feature exists to remove.

-- ---------------------------------------------------------------------------
-- The inventory. Discovered by re-reading our own indexable-page list
-- (src/lib/seo/pages.ts, which also generates sitemap.xml), so a new article
-- appears here with no manual edit and no second list to maintain.
-- ---------------------------------------------------------------------------
CREATE TABLE seo_url (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Site-root-relative, trailing slash, e.g. '/doodle-ideas/'. The origin is
  -- NOT stored: it is one constant for the whole table and duplicating it 145
  -- times invites a staging URL being submitted to production's index.
  path TEXT NOT NULL UNIQUE,
  -- Human label for the admin table. Denormalised from the article/skill
  -- definition on purpose: it is display copy, re-derived on every discover.
  title TEXT,
  -- 'sitemap' (derived from the page list) | 'manual' (added by an admin).
  -- A manual row survives discovery; a sitemap row is reconciled against it.
  source TEXT NOT NULL DEFAULT 'sitemap',
  changefreq TEXT,
  priority TEXT,
  -- Last meaningful content change, from the article's updatedDate/pubDate.
  -- This is the re-submission trigger: IndexNow is for added/updated/deleted
  -- pages, so a URL is only re-pushed when this moves past the last successful
  -- submission. Without it the hourly cron would resubmit all 145 URLs every
  -- hour, which the IndexNow FAQ specifically warns against.
  content_lastmod INTEGER,
  first_seen_at INTEGER NOT NULL,
  -- Bumped on every discover run that still finds the path.
  last_seen_at INTEGER NOT NULL,
  -- Set when a path drops out of the page list. The row is kept, not deleted,
  -- so its submission history survives an unpublish/republish cycle.
  -- Deliberately does NOT trigger an IndexNow deletion notice: a path can leave
  -- the sitemap because a draft was toggled, and asking Bing to drop a page
  -- that still returns 200 is a self-inflicted deindexing.
  removed_at INTEGER
);

-- The tracker's default read: live rows, newest content first.
CREATE INDEX seo_url_removed_lastmod_idx ON seo_url (removed_at, content_lastmod);

-- ---------------------------------------------------------------------------
-- Append-only push log.
-- ---------------------------------------------------------------------------
CREATE TABLE seo_submission (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url_id INTEGER NOT NULL,
  -- 'indexnow' today. 'bing' (SubmitUrlBatch) is the next engine to land here,
  -- which is why this is a column and not implied by the table name.
  engine TEXT NOT NULL,
  -- Groups every row written by one sync run, so a failed run is one query to
  -- find and the UI can say "23 URLs, 3 failed" about a specific attempt.
  batch_id TEXT NOT NULL,
  -- 'manual' (admin pressed Sync) | 'cron' (hourly tick).
  trigger TEXT NOT NULL,
  status_code INTEGER,
  -- Stored as 0/1 rather than derived from status_code, because "ok" is a
  -- protocol judgement (IndexNow's 202 means accepted-pending-key-validation,
  -- which is a success) and that judgement belongs next to the row it describes.
  ok INTEGER NOT NULL,
  error TEXT,
  submitted_at INTEGER NOT NULL
);

-- "When was this URL last successfully pushed to this engine?" — the query the
-- re-submission decision makes once per URL per run.
CREATE INDEX seo_submission_url_engine_idx ON seo_submission (url_id, engine, submitted_at);
CREATE INDEX seo_submission_batch_idx ON seo_submission (batch_id);

-- ---------------------------------------------------------------------------
-- Current verdict per (url, engine). Written by the status readers:
--   google -> Search Console URL Inspection API (2000/day, 600/min per property)
--   bing   -> Bing Webmaster GetUrlInfo
-- Both need credentials this slice does not have yet, so the table ships empty
-- and the UI renders "Not checked" rather than inventing a verdict. An absent
-- row means "we have never asked", which is a different and more honest state
-- than "not indexed".
-- ---------------------------------------------------------------------------
CREATE TABLE seo_index_state (
  url_id INTEGER NOT NULL,
  engine TEXT NOT NULL,
  -- Normalised: 'indexed' | 'not_indexed' | 'crawled_not_indexed' |
  -- 'duplicate' | 'excluded' | 'error'. Normalised rather than raw because the
  -- two engines describe the same outcomes in different vocabularies and the
  -- table has one green/red column.
  verdict TEXT NOT NULL,
  -- The engine's own wording, kept verbatim next to our normalisation so a
  -- surprising pill can be traced back without re-querying the API.
  coverage_state TEXT,
  last_crawled_at INTEGER,
  robots_state TEXT,
  -- The canonical the engine picked. This is the field that explains a
  -- near-duplicate landing page failing to index, so it is a column and not
  -- buried in `raw`.
  canonical TEXT,
  checked_at INTEGER NOT NULL,
  -- Full response, for debugging a verdict we did not expect.
  raw TEXT,
  PRIMARY KEY (url_id, engine)
);
