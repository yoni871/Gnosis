-- Up Migration
--
-- Licensed translations, App half (see the Bible half in
-- database/migrations/bible/20261106144711_add-licensed-translations.sql,
-- which seeds the bible_translations rows this cache refers to).
--
-- The licensed five (ESV, NIV, NLT, NKJV, NASB 2020) may NOT be stored
-- as full text: their publishers only allow a bounded, expiring cache,
-- fetched live from the publisher's own API. So this migration adds:
--
-- - licensed_chapter_cache: one row per (translation, book, chapter) that
--   a reader actually opened. verses is the chapter as JSON
--   [{verse_number, text}]. Rows expire 30 days after fetched_at (the
--   longest the API.Bible terms allow; ESV rows are additionally capped
--   at 500 verses in total by the service, per Crossway's terms).
--   fums_token is API.Bible's fair-use token for the fetch, reported on
--   each display of the cached chapter.
-- - licensed_api_usage: provider call counts per period, for the quota
--   guard. period is 'YYYY-MM' for monthly budgets (API.Bible) and
--   'YYYY-MM-DD' for daily budgets (ESV, NLT).
-- - licensed_ip_limits: per-visitor counts of uncached licensed fetches,
--   one row per (HMAC-hashed IP, hour bucket). Cached chapters are free
--   and unlimited; only calls that would hit a publisher count here.
--
-- translation_id and book_id are plain integers: their foreign keys
-- live in the Bible project (bible_translations, bible_books), so the
-- application validates them against the Bible pool before writing
-- (see backend/src/services/licensed/licensedTranslations.js).
--
-- No grants are in this file: like the earlier auth migrations, the
-- operator applies them at deploy time. The app role needs
-- SELECT/INSERT/UPDATE/DELETE on licensed_chapter_cache and
-- SELECT/INSERT/UPDATE on licensed_api_usage and licensed_ip_limits.
-- See docs/LicensedTranslations.md.

CREATE TABLE licensed_chapter_cache (
    id SERIAL PRIMARY KEY,
    translation_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    chapter_number INTEGER NOT NULL,
    verses JSONB NOT NULL,
    verse_count INTEGER NOT NULL,
    fums_token TEXT,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_licensed_chapter UNIQUE (translation_id, book_id, chapter_number)
);

CREATE INDEX licensed_chapter_cache_fetched_idx
    ON licensed_chapter_cache (translation_id, fetched_at);

CREATE TABLE licensed_api_usage (
    provider TEXT NOT NULL,
    period TEXT NOT NULL,
    calls INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (provider, period)
);

CREATE TABLE licensed_ip_limits (
    key_hash TEXT NOT NULL,
    window_hour TIMESTAMPTZ NOT NULL,
    calls INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key_hash, window_hour)
);

-- Down Migration
DROP TABLE licensed_ip_limits;
DROP TABLE licensed_api_usage;
DROP TABLE licensed_chapter_cache;
