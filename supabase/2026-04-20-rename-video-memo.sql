-- ═════════════════════════════════════════════════════════════════════════
-- 2026-04-20 · Rename video_* → youtube_*, memos → notes, item.memo → item.note
-- ═════════════════════════════════════════════════════════════════════════
--
-- Data is preserved — RENAME TABLE / RENAME COLUMN are non-destructive.
-- Run entire block in a single transaction in the Supabase SQL editor.
--
-- Scope: unify codebase naming with UI labels (YouTube / Notes).
-- After this, `/api/video → /api/youtube`, `/api/memo → /api/notes`,
-- `video_sources → youtube_sources`, `video_items → youtube_items`,
-- `memos → notes`, `feed_items.memo → feed_items.note`, `video_items.memo → youtube_items.note`.

BEGIN;

-- ── Tables ─────────────────────────────────────────────────────────────
ALTER TABLE video_sources RENAME TO youtube_sources;
ALTER TABLE video_items   RENAME TO youtube_items;
ALTER TABLE memos         RENAME TO notes;

-- ── Columns: rename inline memo → note on item tables ──────────────────
ALTER TABLE feed_items    RENAME COLUMN memo TO note;
ALTER TABLE youtube_items RENAME COLUMN memo TO note;

-- ── Indexes (rename to match new table prefix) ─────────────────────────
ALTER INDEX IF EXISTS idx_video_items_user_video  RENAME TO idx_youtube_items_user_video;
ALTER INDEX IF EXISTS idx_video_items_feed        RENAME TO idx_youtube_items_feed;
ALTER INDEX IF EXISTS idx_video_items_read        RENAME TO idx_youtube_items_read;
ALTER INDEX IF EXISTS idx_video_items_bookmark    RENAME TO idx_youtube_items_bookmark;
ALTER INDEX IF EXISTS idx_video_items_pinned_at   RENAME TO idx_youtube_items_pinned_at;

-- ── RLS: drop old policies + recreate with new name ────────────────────
-- (RENAME TABLE preserves policies but the policy name references old table in its title.)
DROP POLICY IF EXISTS "Users can manage their own video sources" ON youtube_sources;
DROP POLICY IF EXISTS "Users can manage their own video items"   ON youtube_items;

CREATE POLICY "Users can manage their own youtube sources"
  ON youtube_sources FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own youtube items"
  ON youtube_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;
