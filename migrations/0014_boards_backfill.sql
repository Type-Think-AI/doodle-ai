-- Backfill for 0013_boards. Converts existing containers into boards.
--
-- NOTHING IS DELETED HERE. `moodboard_item`, `project` and `asset` are left
-- fully intact so this migration is reversible by truncating the three board
-- tables. They are dropped in a later migration, once the boards UI has been
-- exercised in production.
--
-- Ordering matters: inbox boards must exist before moodboard items can be
-- attached to them, and project boards before assets.
--
-- SORT KEY FORMAT: zero-padded epoch seconds, printf('%011d', created_at/1000).
-- Zero padding is what makes lexicographic ordering equal chronological
-- ordering, and 11 digits stays monotonic past year 5000. The application's key
-- generator (lane 1) MUST emit keys that sort after these -- same width, same
-- padding -- or backfilled items will float above everything created later.

-- 1. One Inbox board per user, owned by their earliest organization.
--
-- Per USER, not per org: `moodboard_item.user_id` is NOT NULL while its
-- `organization_id` is nullable, so the moodboard's real grain is the person.
-- One inbox per user also keeps step 2's join single-valued.
--
-- A user with no membership row gets no inbox here. That is fine and expected:
-- requireOrg() (src/lib/auth/guards.ts) self-heals a missing organization, and
-- the app's get-or-create inbox path covers them on next visit.
INSERT INTO board (id, organization_id, created_by, name, kind, view_mode, created_at, updated_at)
SELECT
  lower(hex(randomblob(16))),
  (SELECT m.organization_id FROM member m WHERE m.user_id = u.id ORDER BY m.created_at LIMIT 1),
  u.id,
  'Inbox',
  'inbox',
  'grid',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM user u
WHERE (SELECT m.organization_id FROM member m WHERE m.user_id = u.id ORDER BY m.created_at LIMIT 1) IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM board b WHERE b.created_by = u.id AND b.kind = 'inbox');
--> statement-breakpoint

-- 2. Moodboard items -> that user's Inbox.
-- OR IGNORE leans on board_item's unique(board_id, url) to collapse the
-- duplicates the old client could accumulate.
INSERT OR IGNORE INTO board_item
  (id, board_id, organization_id, url, kind, generation_id, sort_key, created_by, created_at)
SELECT
  lower(hex(randomblob(16))),
  b.id,
  b.organization_id,
  mi.url,
  'generation',
  mi.generation_id,
  printf('%011d', mi.created_at / 1000),
  mi.user_id,
  mi.created_at
FROM moodboard_item mi
JOIN board b ON b.created_by = mi.user_id AND b.kind = 'inbox';
--> statement-breakpoint

-- 3. Projects -> custom boards, REUSING THE PROJECT ID as the board id.
-- That is what lets /projects/:id redirect straight to /b/:id with no lookup
-- table, so existing links and any shared client URLs keep resolving.
INSERT INTO board
  (id, organization_id, created_by, name, description, kind, view_mode, archived_at, created_at, updated_at)
SELECT
  p.id,
  p.organization_id,
  p.created_by,
  p.name,
  p.brief,
  'custom',
  'grid',
  CASE WHEN p.status = 'archived' THEN p.updated_at ELSE NULL END,
  p.created_at,
  p.updated_at
FROM project p
WHERE NOT EXISTS (SELECT 1 FROM board b WHERE b.id = p.id);
--> statement-breakpoint

-- 4. Project assets -> board items on the converted board.
--
-- `review_state` has no equivalent in the board model. Rather than drop it
-- silently, any non-draft state is preserved as a human-readable note so the
-- information survives in the UI instead of only in a backup.
INSERT OR IGNORE INTO board_item
  (id, board_id, organization_id, url, kind, generation_id, note, sort_key, created_by, created_at)
SELECT
  a.id,
  a.project_id,
  a.organization_id,
  a.url,
  CASE a.kind WHEN 'reference' THEN 'reference' WHEN 'upload' THEN 'upload' ELSE 'generation' END,
  a.generation_id,
  CASE
    WHEN a.review_state IS NOT NULL AND a.review_state <> 'draft'
    THEN 'Was marked: ' || replace(a.review_state, '_', ' ')
    ELSE NULL
  END,
  printf('%011d', a.created_at / 1000),
  a.created_by,
  a.created_at
FROM asset a
WHERE a.project_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM board b WHERE b.id = a.project_id);
--> statement-breakpoint

-- 5. Orphan assets (no project) -> their creator's Inbox, so nothing is stranded.
INSERT OR IGNORE INTO board_item
  (id, board_id, organization_id, url, kind, generation_id, sort_key, created_by, created_at)
SELECT
  a.id,
  b.id,
  b.organization_id,
  a.url,
  CASE a.kind WHEN 'reference' THEN 'reference' WHEN 'upload' THEN 'upload' ELSE 'generation' END,
  a.generation_id,
  printf('%011d', a.created_at / 1000),
  a.created_by,
  a.created_at
FROM asset a
JOIN board b ON b.created_by = a.created_by AND b.kind = 'inbox'
WHERE a.project_id IS NULL;
--> statement-breakpoint

-- 6. Re-point project share links at the board that replaced the project.
-- Asset-scoped links are deliberately left as scope='asset'; they are rare and
-- the board share sheet does not offer single-item links.
UPDATE share_link
SET board_id = project_id,
    scope = 'board'
WHERE scope = 'project'
  AND project_id IS NOT NULL
  AND board_id IS NULL;
--> statement-breakpoint

-- 7. Set each board's updated_at to its newest item so /boards can order by
-- real activity rather than by conversion time.
UPDATE board
SET updated_at = COALESCE(
  (SELECT MAX(bi.created_at) FROM board_item bi WHERE bi.board_id = board.id),
  updated_at
);
