-- Up Migration

-- Perf audit 2026-11-06: the ESV 500-verse-cap check
-- (SELECT COALESCE(SUM(verse_count), 0) ... WHERE translation_id = $1)
-- seq-scanned licensed_chapter_cache on every ESV chapter store
-- (21 ms cold / 1.5 ms warm for 1,189 rows). Including verse_count
-- in the existing (translation_id, fetched_at) index makes it an
-- index-only scan (measured 0.24-0.36 ms) and keeps the
-- oldest-chapter eviction DELETE on the same index prefix.
DROP INDEX IF EXISTS licensed_chapter_cache_fetched_idx;
CREATE INDEX licensed_chapter_cache_fetched_idx
    ON licensed_chapter_cache (translation_id, fetched_at) INCLUDE (verse_count);

-- Down Migration

DROP INDEX IF EXISTS licensed_chapter_cache_fetched_idx;
CREATE INDEX licensed_chapter_cache_fetched_idx
    ON licensed_chapter_cache (translation_id, fetched_at);
