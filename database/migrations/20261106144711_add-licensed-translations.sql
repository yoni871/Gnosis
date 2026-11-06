-- Up Migration
--
-- Licensed translations (ESV, NIV, NLT, NKJV, NASB 2020).
--
-- The four stored translations (BSB, WEB, KJV, ASV) live as full text in
-- bible_verses. The licensed five may NOT be stored that way: their
-- publishers only allow a bounded, expiring cache, fetched live from the
-- publisher's own API. So this migration adds:
--
-- - source / enabled / notice / notice_url on bible_translations. The
--   `source` tells the chapter endpoint where the text comes from
--   ('database' or a provider key: 'esv', 'api-bible', 'nlt'). `enabled`
--   is the kill-switch: turning a licensed translation off is one UPDATE,
--   no code change and no redeploy. `notice` is the publisher's copyright
--   line, shown under every licensed passage; `notice_url` is the link
--   the licence asks for on the same page (ESV -> esv.org, NASB ->
--   lockman.org, NIV/NKJV -> api.bible per the Starter-plan citation
--   rule). NLT carries no link requirement, so its notice_url is NULL.
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
-- No grants are in this file: like the earlier auth migrations, the
-- operator applies them at deploy time. The app role needs
-- SELECT/INSERT/UPDATE/DELETE on licensed_chapter_cache and
-- SELECT/INSERT/UPDATE on licensed_api_usage and licensed_ip_limits.
-- See docs/LicensedTranslations.md.

ALTER TABLE bible_translations
    ADD COLUMN source TEXT NOT NULL DEFAULT 'database',
    ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN notice TEXT,
    ADD COLUMN notice_url TEXT;

INSERT INTO bible_translations (id, name, abbreviation, source, enabled, notice, notice_url)
SELECT 5, 'English Standard Version', 'ESV', 'esv', TRUE,
    'Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.',
    'https://www.esv.org'
WHERE NOT EXISTS (SELECT 1 FROM bible_translations WHERE abbreviation = 'ESV');

INSERT INTO bible_translations (id, name, abbreviation, source, enabled, notice, notice_url)
SELECT 6, 'New International Version', 'NIV', 'api-bible', TRUE,
    'The Holy Bible, New International Version® NIV® Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.® Used by Permission of Biblica, Inc.® All rights reserved worldwide.',
    'https://api.bible'
WHERE NOT EXISTS (SELECT 1 FROM bible_translations WHERE abbreviation = 'NIV');

INSERT INTO bible_translations (id, name, abbreviation, source, enabled, notice, notice_url)
SELECT 7, 'New Living Translation', 'NLT', 'nlt', TRUE,
    'Scripture quotations marked (NLT) are taken from the Holy Bible, New Living Translation, copyright © 1996, 2004, 2015 by Tyndale House Foundation. Used by permission of Tyndale House Publishers, Carol Stream, Illinois 60188. All rights reserved.',
    NULL
WHERE NOT EXISTS (SELECT 1 FROM bible_translations WHERE abbreviation = 'NLT');

INSERT INTO bible_translations (id, name, abbreviation, source, enabled, notice, notice_url)
SELECT 8, 'New King James Version', 'NKJV', 'api-bible', TRUE,
    'Scripture taken from the New King James Version®. Copyright © 1982 by Thomas Nelson. Used by permission. All rights reserved.',
    'https://api.bible'
WHERE NOT EXISTS (SELECT 1 FROM bible_translations WHERE abbreviation = 'NKJV');

INSERT INTO bible_translations (id, name, abbreviation, source, enabled, notice, notice_url)
SELECT 9, 'New American Standard Bible', 'NASB', 'api-bible', TRUE,
    'New American Standard Bible®, Copyright © 1960, 1971, 1977, 1995, 2020 by The Lockman Foundation. All rights reserved.',
    'https://www.lockman.org'
WHERE NOT EXISTS (SELECT 1 FROM bible_translations WHERE abbreviation = 'NASB');

SELECT setval('bible_translations_id_seq', (SELECT MAX(id) FROM bible_translations));

CREATE TABLE licensed_chapter_cache (
    id SERIAL PRIMARY KEY,
    translation_id INTEGER NOT NULL REFERENCES bible_translations(id),
    book_id INTEGER NOT NULL REFERENCES bible_books(id),
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
DELETE FROM bible_translations WHERE abbreviation IN ('ESV', 'NIV', 'NLT', 'NKJV', 'NASB');
ALTER TABLE bible_translations
    DROP COLUMN source,
    DROP COLUMN enabled,
    DROP COLUMN notice,
    DROP COLUMN notice_url;
