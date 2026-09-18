const pool = require("../db/db");
const { get } = require("../routes/searchRoutes");

const getAllBooks = () => {
    return pool.query("SELECT * FROM bible_books");
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

const getAllTranslations = () => {
    return pool.query("SELECT * FROM bible_translations");
}

const getAllCommentaries = () => {
    return pool.query(
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
    return pool.query(
         "SELECT * FROM commentary_entries WHERE book_id = $1",
        [bookId],
    )
}

const getAllSources = () => {
    return pool.query("SELECT * FROM sources");
}

const getCommentariesByChapter = (bookId, chapterNumber, commentaryId) => {
    return pool.query(
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
    return pool.query(
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

    const commentariesResult = await pool.query(
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
    getAllCommentaries,
    getCommentariesByBook,
    getAllSources,
    getCommentariesByChapter,
    getCommentariesByVerse,
    getChapterByBook,
    getStudyByChapter
};