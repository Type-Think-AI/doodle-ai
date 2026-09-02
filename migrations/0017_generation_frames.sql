-- 0017 — per-frame correlation for webhook-delivered image generations.
--
-- WHY THIS TABLE EXISTS.
-- Images are now submitted asynchronously and delivered by webhook (the
-- synchronous path was removed 2026-09-01). One `generation` row can own several
-- upstream renders: a pack skill makes one PicX call PER FRAME — 4 for Seasonal,
-- 6 for Festival, 9 for Expressions — and each call returns its own generation
-- id. A single `picx_generation_id` column on `generation` can therefore only
-- correlate the last submit, and the other eight deliveries would arrive with no
-- row to land on.
--
-- So each frame gets a row, keyed on the id PicX will quote back at us. The
-- webhook writes the frame's URL, and when no frame is left pending it rolls the
-- parent `generation` up to 'ok' with output_urls in frame order.
--
-- Correlation is on the id from the SIGNED BODY, never a URL path parameter —
-- same argument as migrations/0010 and 0016.
--
-- A single-image skill has exactly one frame here, so there is one code path for
-- both cases rather than a special case for packs.

CREATE TABLE IF NOT EXISTS generation_frame (
  id TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL REFERENCES generation(id) ON DELETE CASCADE,
  -- Position in the finished set, 0-based. Determines output_urls order, so a
  -- pack's frames cannot shuffle based on which delivery arrived first.
  idx INTEGER NOT NULL,
  -- PicX's id for this one render. The webhook's only correlation key.
  picx_generation_id TEXT,
  -- The prompt actually sent. Captured at submit time because the builders
  -- randomize per call and it could not be reconstructed later.
  prompt TEXT,
  -- 'pending' | 'ok' | 'failed'
  status TEXT NOT NULL DEFAULT 'pending',
  output_url TEXT,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS generation_frame_picx_idx
  ON generation_frame (picx_generation_id);

CREATE INDEX IF NOT EXISTS generation_frame_parent_idx
  ON generation_frame (generation_id, idx);
