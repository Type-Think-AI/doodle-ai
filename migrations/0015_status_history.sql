-- Durable history behind /status, so the page can state an uptime figure
-- instead of decorating a live snapshot with a fake 90-day strip.
--
-- Written by the hourly cron in src-worker/entry.ts, NOT by the /api/status
-- request path. That distinction is the whole design:
--
--   * A request-path write would turn a public, crawlable, auto-refreshing page
--     into an unbounded write amplifier — one D1 insert per component per view,
--     from bots included. The endpoint is cached at the edge precisely so most
--     views never reach the Worker at all, and a page view is not evidence
--     about availability anyway (it only proves the edge answered).
--   * An hourly sample is evidence: it is taken on a fixed cadence whether or
--     not anyone is looking, which is what makes averaging it meaningful.
--
-- One row per component per tick. At 24 rows/day/component and ~15 components
-- that is ~131k rows over the 90-day window the page reports on, which the same
-- cron prunes. Small enough that no partitioning or rollup table is warranted.
CREATE TABLE status_sample (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Stable probe id (see PROBES in src/lib/status/probes.ts), e.g. 'db', 'kv'.
  -- Deliberately a plain TEXT key with no foreign key: probes are code, not
  -- rows, and a retired probe's history should survive its removal rather than
  -- cascade away and silently improve the historical uptime number.
  component TEXT NOT NULL,
  -- 'operational' | 'degraded' | 'down'. Never 'metered': a metered component
  -- is never probed, so it has no observation to record and must not be able to
  -- contribute to an uptime average.
  state TEXT NOT NULL,
  -- NULL where a probe has no meaningful duration (e.g. the secrets check,
  -- which resolves bindings rather than making a round trip).
  latency_ms INTEGER,
  checked_at INTEGER NOT NULL
);

-- The only read shape the page issues: one component's window, newest first.
CREATE INDEX status_sample_component_checked_idx ON status_sample (component, checked_at);
-- Supports the retention delete without scanning the whole table.
CREATE INDEX status_sample_checked_idx ON status_sample (checked_at);
