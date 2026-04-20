-- ═════════════════════════════════════════════════════════════════════════
-- 2026-04-20 · Drop bookmark collection feature + introduce pinned saved view
-- ═════════════════════════════════════════════════════════════════════════
--
-- Destructive: drops bookmark_collections and video_bookmark_collections
-- tables and the collection_id FKs on feed_items / video_items. Replaces
-- with a `pinned_at` timestamp column per item (null = unpinned). Max 3 pinned
-- enforced at the API layer. Safe to run in production — collection data will
-- be lost (no dependents besides the dropped columns).
--
-- Apply order: run the whole block in a single transaction in the Supabase
-- SQL editor (or `psql`). `db:push` after merging this PR should arrive at
-- the same end state, but the explicit SQL here is the authoritative migration.

BEGIN;

-- ── feed items: drop collection_id column + index ───────────────────────
DROP INDEX IF EXISTS idx_items_collection;
ALTER TABLE feed_items DROP COLUMN IF EXISTS collection_id;

-- ── video items: drop collection_id column ─────────────────────────────
ALTER TABLE video_items DROP COLUMN IF EXISTS collection_id;

-- ── drop collection tables (cascade picks up any leftover FKs / RLS) ──
DROP TABLE IF EXISTS bookmark_collections CASCADE;
DROP TABLE IF EXISTS video_bookmark_collections CASCADE;

-- ── add pinned_at columns + indexes ────────────────────────────────────
ALTER TABLE feed_items  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
ALTER TABLE video_items ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_items_pinned_at       ON feed_items(pinned_at);
CREATE INDEX IF NOT EXISTS idx_video_items_pinned_at ON video_items(pinned_at);

COMMIT;
