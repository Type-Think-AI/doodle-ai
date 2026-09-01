-- Migration: extend `generation` for server-side async video, additively.
--
-- Server-side video reuses the existing `generation` row rather than a new
-- table: a clip IS a generation — it has a prompt, a cost, a status, an output
-- URL and an org owner exactly like an image. The only differences are a handful
-- of video-only facts, added here as nullable columns so the whole image path
-- and every historical row keep working untouched.
--
-- `picx_generation_id` is the correlation column, and it is here for the SAME
-- reason migrations/0010 added it to `batch_item`: video is submit-then-webhook.
-- The route submits to PicX, which answers 202 and later POSTs the finished clip
-- to our webhook. That inbound delivery identifies the work by *PicX's*
-- generation id (`data.generation_id`), a different namespace from our own
-- `generation.id`, so without this column there is no way to map a delivery back
-- to the row waiting for it. The receiver trusts ONLY this id for correlation:
-- the signature covers the request body, not the URL, so correlating on a
-- callback-URL path parameter would let a captured delivery replayed against a
-- different row still verify. Looking the row up by the id inside the signed
-- body makes that mis-attribution impossible.
--
-- No FOREIGN KEY, consistent with 0006_drop_foreign_keys.sql and 0010: this
-- references an id in PicX's database, not ours, so there is nothing local to
-- point at.
--
-- Every column is nullable (or defaulted) because it is only set on the video
-- path — an image generation, or any row created before this migration, never
-- has one and must keep working.

-- 'image' | 'video'. Defaulted so pre-existing rows and the image path read as
-- 'image' with no backfill. reconcile.ts branches its stuck-pending refund
-- window on this: an unfinished video may still be rendering long after an image
-- of the same age is a dead isolate.
ALTER TABLE generation ADD COLUMN kind TEXT NOT NULL DEFAULT 'image';

-- The correlation column described above.
ALTER TABLE generation ADD COLUMN picx_generation_id TEXT;

-- Clip length actually submitted, after clamping to the model's 5-15s range.
ALTER TABLE generation ADD COLUMN duration_seconds INTEGER;

-- Video tier actually requested, e.g. '480p'. The clip is priced from this.
ALTER TABLE generation ADD COLUMN resolution TEXT;

-- 'text' | 'image' | 'reference' — which input route produced the clip.
ALTER TABLE generation ADD COLUMN video_mode TEXT;

-- The receiver's only query is "which generation is this delivery for", so the
-- lookup has to be indexed or every video webhook becomes a full table scan.
-- Partial (WHERE NOT NULL) so the millions of image rows that never set it stay
-- out of the index.
CREATE INDEX IF NOT EXISTS generation_picx_generation_idx
  ON generation (picx_generation_id)
  WHERE picx_generation_id IS NOT NULL;
