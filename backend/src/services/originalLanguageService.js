const { biblePool: pool } = require("../db/db");

// Original Language Analysis (Phase 1): word-level Hebrew/Greek data
// imported from STEPBible-Data (CC BY 4.0) for Genesis 1 and
// Philippians 3 only. See docs/OriginalLanguage.md.

const getBookByName = async (name) => {
    const result = await pool.query(
        "SELECT id, name, testament FROM bible_books WHERE name = $1",
        [name]
    );
    return result.rows.length === 0 ? null : result.rows[0];
};

const getSources = async (codes) => {
    const result = await pool.query(
        `SELECT code, name, url, license, attribution, text_edition, language
         FROM ol_sources WHERE code = ANY($1::text[]) ORDER BY code`,
        [codes]
    );
    return result.rows;
};

// Words for a passage, ordered by verse then word position, each with
// its lexical entry (lemma, gloss, plain Strong's number).
const getPassageWords = async (bookId, chapter, startVerse, endVerse) => {
    const result = await pool.query(
        `SELECT
            w.id, w.book_id, w.chapter_number, w.verse_number, w.word_index,
            w.language, w.word_text, w.transliteration, w.gloss,
            w.strong_number, w.morphology_code, w.grammar_display, w.morphemes,
            l.strong_base, l.lemma, l.transliteration AS lemma_transliteration,
            l.gloss AS meaning, l.lexical_morphology
         FROM ol_word_occurrences w
         LEFT JOIN ol_lexical_entries l ON l.strong_number = w.strong_number
         WHERE w.book_id = $1 AND w.chapter_number = $2
           AND w.verse_number >= $3 AND w.verse_number <= $4
         ORDER BY w.verse_number, w.word_index`,
        [bookId, chapter, startVerse, endVerse]
    );
    return result.rows;
};

// The chapter title: Psalm superscriptions live at verse 0 in the
// STEPBible refs (e.g. Psa.3.0). The API returns them separately from
// the verses — never merged into verse 1 — so the modal can render a
// distinct "Psalm title" block.
const getTitleWords = async (bookId, chapter) => {
    const result = await pool.query(
        `SELECT
            w.id, w.book_id, w.chapter_number, w.verse_number, w.word_index,
            w.language, w.word_text, w.transliteration, w.gloss,
            w.strong_number, w.morphology_code, w.grammar_display, w.morphemes,
            l.strong_base, l.lemma, l.transliteration AS lemma_transliteration,
            l.gloss AS meaning, l.lexical_morphology
         FROM ol_word_occurrences w
         LEFT JOIN ol_lexical_entries l ON l.strong_number = w.strong_number
         WHERE w.book_id = $1 AND w.chapter_number = $2
           AND w.verse_number = 0
         ORDER BY w.word_index`,
        [bookId, chapter]
    );
    return result.rows;
};

const getWordById = async (id) => {
    const result = await pool.query(
        `SELECT
            w.id, w.book_id, w.chapter_number, w.verse_number, w.word_index,
            w.language, w.word_text, w.transliteration, w.gloss,
            w.strong_number, w.morphology_code, w.grammar_display, w.morphemes,
            l.strong_base, l.lemma, l.transliteration AS lemma_transliteration,
            l.gloss AS meaning, l.lexical_morphology,
            b.name AS book
         FROM ol_word_occurrences w
         LEFT JOIN ol_lexical_entries l ON l.strong_number = w.strong_number
         JOIN bible_books b ON b.id = w.book_id
         WHERE w.id = $1`,
        [id]
    );
    return result.rows.length === 0 ? null : result.rows[0];
};

const getLexicalEntry = async (strongNumber) => {
    const result = await pool.query(
        `SELECT strong_number, strong_base, language, lemma,
                transliteration, gloss, lexical_morphology
         FROM ol_lexical_entries WHERE strong_number = $1`,
        [strongNumber]
    );
    return result.rows.length === 0 ? null : result.rows[0];
};

// Occurrences of one lemma (same disambiguated Strong's) or, with
// match=strong, of every disambiguated sense sharing its plain
// Strong's number. Phase 1 searches only the imported corpus
// (Genesis 1 and Philippians 3); the response says so.
const getOccurrences = async ({ strongNumber, strongBase, match, limit, offset }) => {
    const filter = match === "strong"
        ? "l.strong_base = $1"
        : "w.strong_number = $1";
    const value = match === "strong" ? strongBase : strongNumber;
    const totalResult = await pool.query(
        `SELECT count(*)::int AS total
         FROM ol_word_occurrences w
         JOIN ol_lexical_entries l ON l.strong_number = w.strong_number
         WHERE ${filter}`,
        [value]
    );
    const result = await pool.query(
        `SELECT
            w.id, w.book_id, w.chapter_number, w.verse_number, w.word_index,
            w.language, w.word_text, w.transliteration, w.gloss,
            w.strong_number, w.grammar_display,
            l.strong_base, l.lemma,
            b.name AS book
         FROM ol_word_occurrences w
         JOIN ol_lexical_entries l ON l.strong_number = w.strong_number
         JOIN bible_books b ON b.id = w.book_id
         WHERE ${filter}
         ORDER BY b.book_order, w.chapter_number, w.verse_number, w.word_index
         LIMIT $2 OFFSET $3`,
        [value, limit, offset]
    );
    return { total: totalResult.rows[0].total, rows: result.rows };
};

// The full verse's words for a set of (book, chapter, verse) refs, so
// each occurrence can be shown with its surrounding original-language
// words as context.
const getVerseWords = async (refs) => {
    if (refs.length === 0) return [];
    const bookIds = refs.map(ref => ref.bookId);
    const chapters = refs.map(ref => ref.chapter);
    const verses = refs.map(ref => ref.verse);
    const result = await pool.query(
        `SELECT book_id, chapter_number, verse_number, word_index, word_text
         FROM ol_word_occurrences
         WHERE (book_id, chapter_number, verse_number) IN (
             SELECT * FROM unnest($1::int[], $2::int[], $3::int[]))
         ORDER BY book_id, chapter_number, verse_number, word_index`,
        [bookIds, chapters, verses]
    );
    return result.rows;
};

module.exports = {
    getBookByName, getSources, getPassageWords, getTitleWords, getWordById,
    getLexicalEntry, getOccurrences, getVerseWords,
};
