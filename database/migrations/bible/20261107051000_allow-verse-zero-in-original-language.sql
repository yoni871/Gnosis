-- Up Migration
-- Psalm titles are stored as verse 0 (STEPBible ref Psa.3.0, e.g. the
-- six words of the Psalm 3 title). The original-language table was created
-- with verse_number > 0, so title words could never be imported and the
-- Psalm-title block added in PR #52 could never return rows. Allow
-- verse_number = 0; verse 0 is only ever a Psalm title, never a verse.
-- (Found by the local disposable-DB verification of Psalms 3 / Daniel 2:
-- the import failed on the verse-0 check constraint.)
ALTER TABLE ol_word_occurrences DROP CONSTRAINT ol_word_occurrences_verse_number_check;
ALTER TABLE ol_word_occurrences ADD CONSTRAINT ol_word_occurrences_verse_number_check CHECK (verse_number >= 0);

-- Down Migration
-- Restores the original constraint. Only safe while no verse-0 rows exist.
ALTER TABLE ol_word_occurrences DROP CONSTRAINT ol_word_occurrences_verse_number_check;
ALTER TABLE ol_word_occurrences ADD CONSTRAINT ol_word_occurrences_verse_number_check CHECK (verse_number > 0);
