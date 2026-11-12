const { biblePool: pool, commentaryPool } = require("../db/db");
const { get } = require("../routes/searchRoutes");
const { isProviderConfigured } = require("./licensed/licensedTranslations");

const getAllBooks = () => {
    // Chapter and verse counts come from the stored Bible data itself, so
    // callers (e.g. the Scripture-mention parser) validate references against
    // what the reader can actually render. chapter_count is the HIGHEST
    // chapter number (0 when the book has no chapters) — not a row count, so
    // a partially seeded book still validates its highest chapter; for
    // complete data the highest number equals the count. verse_counts is null
    // for a book with no verses at all, and omits chapters that have no
    // verses. Verse counts are per chapter across all stored translations
    // (COUNT DISTINCT verse_number), since the stored translations share one
    // versification.
    return pool.query(`
        SELECT b.*,
            (SELECT COALESCE(MAX(chapter_number), 0)::int FROM bible_chapters c WHERE c.book_id = b.id) AS chapter_count,
            (SELECT jsonb_object_agg(c.chapter_number::text, vc.verse_count)
               FROM bible_chapters c
               JOIN (SELECT chapter_id, COUNT(DISTINCT verse_number)::int AS verse_count
                       FROM bible_verses GROUP BY chapter_id) vc
                 ON vc.chapter_id = c.id
              WHERE c.book_id = b.id) AS verse_counts
          FROM bible_books b
         ORDER BY b.book_order
    `);
};

const getAllChapters = (bookId) => {
    return pool.query(
        `
        SELECT * 
        FROM bible_chapters 
        WHERE book_id = $1
        ORDER BY chapter_number
        `
        ,
        [bookId]
    );
};

const getVersesByChapter = (chapterId, translationId) => {
    return pool.query(
        `SELECT * 
        FROM bible_verses 
        WHERE chapter_id = $1 
        AND translation_id = $2
        ORDER BY verse_number
        `,
        [chapterId, translationId]
    )
}

const getAllTranslations = async () => {
    const result = await pool.query("SELECT * FROM bible_translations");
    // The kill-switch is `enabled`, and a licensed translation is only
    // listed once its provider key (and Bible ID, for API.Bible) is set —
    // so the site behaves exactly as before until the keys arrive.
    return {
        rows: result.rows.filter(
            (row) => row.enabled && isProviderConfigured(row)
        ),
    };
}

const getTranslationByAbbreviation = async (abbreviation) => {
    const result = await pool.query(
        "SELECT * FROM bible_translations WHERE abbreviation = $1",
        [abbreviation]
    );
    return result.rows.length === 0 ? null : result.rows[0];
}

const getAllCommentaries = () => {
    return commentaryPool.query(
        `
        SELECT
            commentaries.id,
            commentaries.title,
            sources.name,
            sources.description
        FROM commentaries
        JOIN sources
            ON commentaries.source_id = sources.id
        ORDER BY commentaries.id
        `
    );
}

const getCommentariesByBook = (bookId) => {
    return commentaryPool.query(
         "SELECT * FROM commentary_entries WHERE book_id = $1",
        [bookId],
    )
}

const getAllSources = () => {
    return commentaryPool.query("SELECT * FROM sources");
}

const getCommentariesByChapter = (bookId, chapterNumber, commentaryId) => {
    return commentaryPool.query(
        `
        SELECT 
            commentary_entries.id,
            commentary_entries.content,
            commentary_entries.start_chapter,
            commentary_entries.start_verse,
            commentary_entries.end_chapter,
            commentary_entries.end_verse,
            commentary_entries.title AS entry_title,
            commentaries.title AS commentary_title,
            sources.name,
            sources.description
        FROM commentary_entries 
        JOIN commentaries 
            ON commentary_entries.commentary_id = commentaries.id 
        JOIN sources 
            ON commentaries.source_id = sources.id
        WHERE commentary_entries.book_id = $1
        AND commentary_entries.start_chapter <= $2
        AND commentary_entries.end_chapter >= $2
        AND commentary_entries.commentary_id = $3
        ORDER BY commentary_entries.start_chapter, commentary_entries.start_verse
        `,
        [bookId, chapterNumber, commentaryId]
    );
};

const getCommentariesByVerse = (bookId, chapterNumber, verseNumber) => {
    return commentaryPool.query(
        `
        SELECT 
            commentary_entries.content,
            commentaries.title,
            sources.name
        FROM commentary_entries
        JOIN commentaries
            ON commentary_entries.commentary_id = commentaries.id
        JOIN sources
            ON commentaries.source_id = sources.id
        WHERE commentary_entries.book_id = $1 
            AND (
                (
                    commentary_entries.start_chapter = $2
                    AND commentary_entries.end_chapter = $2
                    AND commentary_entries.start_verse <= $3
                    AND commentary_entries.end_verse >= $3
                )
            OR
                (
                    commentary_entries.start_chapter = $2
                    AND commentary_entries.end_chapter > $2
                    AND commentary_entries.start_verse <= $3
                )
            OR
                (
                    commentary_entries.start_chapter < $2
                    AND commentary_entries.end_chapter = $2
                    AND commentary_entries.end_verse >= $3
                )
            OR
                (
                    commentary_entries.start_chapter < $2
                    AND commentary_entries.end_chapter > $2
                )
            )
        `,
        [bookId, chapterNumber, verseNumber]
    );
};


const getChapterByBook = (book, chapter, translation) => {   
    return pool.query(
        `
        SELECT v.verse_number, 
            v.text,
            c.chapter_number,
            b.name AS book
        FROM bible_verses v
        JOIN bible_chapters c
            ON v.chapter_id = c.id
        JOIN bible_books b
            ON c.book_id = b.id
        JOIN bible_translations bt
            ON v.translation_id = bt.id
        WHERE b.name = $1
        AND c.chapter_number = $2
        AND bt.abbreviation = $3
        ORDER BY v.verse_number
        `,
        [book, chapter, translation]
    );
}

const getStudyByChapter = async (book, chapter, commentaryId) => {
    const versesResult = await pool.query(
        `
        SELECT 
            v.verse_number,
            v.text,
            c.chapter_number,
            b.name AS book
        FROM bible_verses v
        JOIN bible_chapters c
            ON v.chapter_id = c.id
        JOIN bible_books b
            ON c.book_id = b.id
        WHERE b.name = $1
        AND c.chapter_number = $2
        ORDER BY v.verse_number
        `,
        [book, chapter],
    );

    const commentariesResult = await commentaryPool.query(
        `
        SELECT
            e.content,
            e.start_chapter,
            e.start_verse,
            e.end_chapter,
            e.end_verse,
            e.title,
            s.name AS source
         FROM commentary_entries e
        JOIN commentaries c
            ON e.commentary_id = c.id
        JOIN sources s
            ON c.source_id = s.id
        JOIN bible_books b
            ON e.book_id = b.id
        WHERE b.name = $1
        AND e.start_chapter <= $2
        AND e.end_chapter >= $2
        AND e.commentary_id = $3
        ORDER BY e.start_chapter, e.start_verse
        `,
        [book, chapter, commentaryId]
    )

    return {
        verses: versesResult,
        commentaries: commentariesResult
    };
}

module.exports = {
    getAllBooks,
    getAllChapters,
    getVersesByChapter,
    getAllTranslations,
    getTranslationByAbbreviation,
    getAllCommentaries,
    getCommentariesByBook,
    getAllSources,
    getCommentariesByChapter,
    getCommentariesByVerse,
    getChapterByBook,
    getStudyByChapter
};