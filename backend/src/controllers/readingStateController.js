const { logFailure } = require("../utils/safeLog");
const pool = require("../db/db");
const { biblePool, commentaryPool } = require("../db/db");

const isPositiveInteger = (value) => {
    return Number.isInteger(value) && value > 0;
};

const getReadingState = async (req, res) => {
    const userId = req.user.userId;

    try {
        const result = await pool.query(
            "SELECT * FROM user_reading_state WHERE user_id = $1",
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "No saved reading position."
            });
        }

        // The book name comes from the Bible project (no join crosses
        // the project boundary). A missing book reads as no saved
        // position, as the old join did.
        const book = await biblePool.query(
            "SELECT name FROM bible_books WHERE id = $1",
            [result.rows[0].book_id]
        );
        if (book.rows.length === 0) {
            return res.status(404).json({
                error: "No saved reading position."
            });
        }

        return res.status(200).json({
            ...result.rows[0],
            book: book.rows[0].name
        });
    } catch (error) {
        logFailure("readingStateController", error);

        return res.status(500).json({
            error: "Failed to retrieve reading position."
        });
    }
};

const saveReadingState = async (req, res) => {
    const userId = req.user.userId;

    const { bookId, chapter, translation, commentaryId, verse } = req.body;

    // Missing means absent, not merely falsy: a chapter of 0 is present
    // but invalid, and must reach the validity check below.
    if (
        bookId === undefined ||
        chapter === undefined ||
        translation === undefined
    ) {
        return res.status(400).json({
            error: "Book, chapter, and translation are required."
        });
    }

    if (
        !isPositiveInteger(bookId) ||
        !isPositiveInteger(chapter) ||
        typeof translation !== "string" ||
        translation.length === 0 ||
        (commentaryId !== undefined &&
            commentaryId !== null &&
            !isPositiveInteger(commentaryId)) ||
        (verse !== undefined &&
            verse !== null &&
            !isPositiveInteger(verse))
    ) {
        return res.status(400).json({
            error: "The reading position is invalid."
        });
    }

    try {
        // The book, translation and commentary are validated one at a
        // time, each against its own project, instead of in one combined
        // query. The error messages and their precedence (book, then
        // translation, then commentary) are unchanged.
        const book = await biblePool.query(
            "SELECT name FROM bible_books WHERE id = $1",
            [bookId]
        );

        if (book.rows.length === 0) {
            return res.status(400).json({
                error: "The book does not exist."
            });
        }

        const translationExists = await biblePool.query(
            "SELECT 1 FROM bible_translations WHERE abbreviation = $1",
            [translation]
        );

        if (translationExists.rows.length === 0) {
            return res.status(400).json({
                error: "The translation does not exist."
            });
        }

        if (commentaryId !== undefined && commentaryId !== null) {
            const commentary = await commentaryPool.query(
                "SELECT 1 FROM commentaries WHERE id = $1",
                [commentaryId]
            );

            if (commentary.rows.length === 0) {
                return res.status(400).json({
                    error: "The commentary does not exist."
                });
            }
        }

        const result = await pool.query(
            `
            INSERT INTO user_reading_state (
                user_id,
                book_id,
                chapter_number,
                translation,
                commentary_id,
                verse_number,
                updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                book_id = EXCLUDED.book_id,
                chapter_number = EXCLUDED.chapter_number,
                translation = EXCLUDED.translation,
                commentary_id = EXCLUDED.commentary_id,
                verse_number = EXCLUDED.verse_number,
                updated_at = NOW()
            RETURNING *
            `,
            [
                userId,
                bookId,
                chapter,
                translation,
                commentaryId ?? null,
                verse ?? null
            ]
        );

        return res.status(200).json({
            ...result.rows[0],
            book: book.rows[0].name
        });
    } catch (error) {
        logFailure("readingStateController", error);

        return res.status(500).json({
            error: "Failed to save reading position."
        });
    }
};

module.exports = {
    getReadingState,
    saveReadingState
};
