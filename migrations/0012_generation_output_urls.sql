-- Pack skills (Emotional Modes, Seasonal Pack, Expression Pack) produce several
-- images from a single run — one PicX call per variant, since PicX exposes no
-- `n` parameter. `output_url` can only hold one of them.
--
-- Additive and nullable on purpose: `output_url` keeps holding the FIRST frame,
-- so every existing reader (thread thumbnails, project assets, admin surfaces,
-- the reconciliation job) is unaffected and no backfill is needed. Rows written
-- before this migration simply have NULL here, which correctly means
-- "single-image generation, see output_url".
ALTER TABLE generation ADD COLUMN output_urls TEXT;
