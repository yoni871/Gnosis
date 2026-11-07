-- Up Migration
--
-- Original Language Analysis (Phase 1): word-level Hebrew and Greek
-- data for Genesis 1 and Philippians 3 only.
--
-- Source: STEPBible-Data (Tyndale House / STEPBible.org), CC BY 4.0.
--   TAHOT  — Translators Amalgamated Hebrew Old Testament (Leningrad
--            Codex via Westminster Leningrad Codex 4.20)
--   TAGNT  — Translators Amalgamated Greek New Testament (NA27/28)
--   TBESH / TBESG — brief lexicons of extended Strong's (Hebrew / Greek)
--   TEHMC / TEGMC — expansions of the Hebrew / Greek morphology codes
-- Attribution: "Original-language data: STEPBible (Tyndale House /
-- STEPBible.org), CC BY 4.0". Source: https://github.com/STEPBible/
-- STEPBible-Data
--
-- Tables:
--   ol_sources           — linguistic data sources + attribution (seeded)
--   ol_lexical_entries   — one row per lemma, keyed by disambiguated
--                          Strong's number (e.g. H7225G, G1108)
--   ol_word_occurrences  — one row per word occurrence, in verse order
--   ol_morphology_codes  — morphology-code expansions (TEHMC/TEGMC)
--
-- Design notes:
--   * Word occurrences reference bible_books by id and carry
--     chapter/verse numbers as integers, following the
--     commentary_entries convention (no FK to bible_chapters).
--   * word_index is the word's position within its verse (1-based),
--     matching the STEPBible word numbering (#01, #02, ...). The
--     natural key (source, book, chapter, verse, word_index) is
--     stable across re-imports; the importer is idempotent on it.
--   * Hebrew words are stored as single rows; their prefix/root/
--     suffix morphemes live in the morphemes JSONB array, each with
--     its own text, transliteration, gloss, Strong's, morphology
--     code, and expanded grammar. Greek words have one morpheme.
--   * strong_number is the disambiguated Strong's (dStrong, e.g.
--     H7225G). strong_base is the plain Strong's (sStrong, e.g.
--     H7225) used for display and for matching across disambiguated
--     senses. Only the short dictionary gloss is stored (the fuller
--     BDB/Abbott-Smith definition paragraphs in TBESH/TBESG carry a
--     note asking for Online Bible permission before use in a
--     project, so they are deliberately NOT imported).
--   * The importer populates ol_lexical_entries, ol_word_occurrences
--     and ol_morphology_codes from the STEPBible files; this file only
--     creates the tables and seeds ol_sources.
--
-- No grants are in this file: like the earlier migrations, the
-- operator applies them at deploy time. The app role needs
-- SELECT on all four tables (the importer runs with a separate
-- operator role). See docs/OriginalLanguage.md.

CREATE TABLE ol_sources (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    url TEXT NOT NULL,
    license TEXT NOT NULL,
    attribution TEXT NOT NULL,
    text_edition TEXT,
    language TEXT NOT NULL CHECK (language IN ('hebrew', 'aramaic', 'greek'))
);

INSERT INTO ol_sources (code, name, description, url, license, attribution, text_edition, language) VALUES
    ('STEPBible-TAHOT',
     'Translators Amalgamated Hebrew Old Testament (TAHOT)',
     'Word-level Hebrew Old Testament with morphology, lemmas and Strong''s numbers.',
     'https://github.com/STEPBible/STEPBible-Data',
     'CC BY 4.0',
     'Original-language data: STEPBible (Tyndale House / STEPBible.org), CC BY 4.0',
     'Leningrad Codex via Westminster Leningrad Codex 4.20',
     'hebrew'),
    ('STEPBible-TAGNT',
     'Translators Amalgamated Greek New Testament (TAGNT)',
     'Word-level Greek New Testament with morphology, lemmas and Strong''s numbers.',
     'https://github.com/STEPBible/STEPBible-Data',
     'CC BY 4.0',
     'Original-language data: STEPBible (Tyndale House / STEPBible.org), CC BY 4.0',
     'NA27/28 (Nestle-Aland)',
     'greek'),
    ('STEPBible-TBESH',
     'Translators Brief lexicon of Extended Strongs for Hebrew (TBESH)',
     'Brief Hebrew lexicon (abridged BDB, conformed to extended Strong''s). Only the short gloss is imported.',
     'https://github.com/STEPBible/STEPBible-Data',
     'CC BY 4.0',
     'Original-language data: STEPBible (Tyndale House / STEPBible.org), CC BY 4.0',
     NULL,
     'hebrew'),
    ('STEPBible-TBESG',
     'Translators Brief lexicon of Extended Strongs for Greek (TBESG)',
     'Brief Greek lexicon (Abbott-Smith based, conformed to extended Strong''s). Only the short gloss is imported.',
     'https://github.com/STEPBible/STEPBible-Data',
     'CC BY 4.0',
     'Original-language data: STEPBible (Tyndale House / STEPBible.org), CC BY 4.0',
     NULL,
     'greek'),
    ('STEPBible-TEHMC',
     'Translators Expansion of Hebrew Morphology Codes (TEHMC)',
     'Expanded explanations of the Hebrew morphology codes used in TAHOT.',
     'https://github.com/STEPBible/STEPBible-Data',
     'CC BY 4.0',
     'Original-language data: STEPBible (Tyndale House / STEPBible.org), CC BY 4.0',
     NULL,
     'hebrew'),
    ('STEPBible-TEGMC',
     'Translators Expansion of Greek Morphology Codes (TEGMC)',
     'Expanded explanations of the Greek morphology codes used in TAGNT.',
     'https://github.com/STEPBible/STEPBible-Data',
     'CC BY 4.0',
     'Original-language data: STEPBible (Tyndale House / STEPBible.org), CC BY 4.0',
     NULL,
     'greek');

CREATE TABLE ol_lexical_entries (
    id SERIAL PRIMARY KEY,
    strong_number TEXT NOT NULL UNIQUE,
    strong_base TEXT NOT NULL,
    language TEXT NOT NULL CHECK (language IN ('hebrew', 'aramaic', 'greek')),
    lemma TEXT NOT NULL,
    transliteration TEXT,
    gloss TEXT,
    lexical_morphology TEXT,
    source_id INTEGER NOT NULL REFERENCES ol_sources(id)
);

CREATE INDEX ol_lexical_entries_strong_base_idx
    ON ol_lexical_entries (strong_base);

CREATE TABLE ol_word_occurrences (
    id SERIAL PRIMARY KEY,
    source_id INTEGER NOT NULL REFERENCES ol_sources(id),
    book_id INTEGER NOT NULL REFERENCES bible_books(id),
    chapter_number INTEGER NOT NULL CHECK (chapter_number > 0),
    verse_number INTEGER NOT NULL CHECK (verse_number > 0),
    word_index INTEGER NOT NULL CHECK (word_index > 0),
    language TEXT NOT NULL CHECK (language IN ('hebrew', 'aramaic', 'greek')),
    word_text TEXT NOT NULL,
    transliteration TEXT,
    gloss TEXT,
    strong_number TEXT REFERENCES ol_lexical_entries(strong_number),
    morphology_code TEXT NOT NULL,
    grammar_display TEXT NOT NULL,
    morphemes JSONB NOT NULL DEFAULT '[]'::jsonb,
    CONSTRAINT ol_word_occurrences_natural_key
        UNIQUE (source_id, book_id, chapter_number, verse_number, word_index)
);

CREATE INDEX ol_word_occurrences_passage_idx
    ON ol_word_occurrences (book_id, chapter_number, verse_number, word_index);

CREATE INDEX ol_word_occurrences_strong_idx
    ON ol_word_occurrences (strong_number);

CREATE TABLE ol_morphology_codes (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL,
    language TEXT NOT NULL CHECK (language IN ('hebrew', 'aramaic', 'greek')),
    expansion TEXT NOT NULL,
    source_id INTEGER NOT NULL REFERENCES ol_sources(id),
    CONSTRAINT ol_morphology_codes_natural_key UNIQUE (language, code)
);

-- Down Migration
DROP TABLE ol_morphology_codes;
DROP TABLE ol_word_occurrences;
DROP TABLE ol_lexical_entries;
DROP TABLE ol_sources;
