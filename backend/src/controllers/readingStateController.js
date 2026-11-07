const pool = require("../db/db");

const SELECT_READING_STATE = `
    SELECT
        user_reading_state.*,
        bible_books.name AS book
    FROM user_reading_state
    JOIN bible_books
        ON user_reading_state.book_id = bible_books.id
    WHERE user_reading_state.user_id = $1
`;

const isPositiveInteger = (value) => {
    return Number.isInteger(value) && value > 0;
};

const getReadingState = async (req, res) => {
    const userId = req.user.userId;

    try {
        const result = await pool.query(SELECT_READING_STATE, [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "No saved reading position."
            });
        }

        return res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error(error);

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
        // One round-trip validates the book, translation, and commentary
        // together and returns the book name for the response, instead
        // of three sequential existence checks. The upsert then returns
        // the saved row, so no re-SELECT is needed. The error messages
        // and their precedence (book, then translation, then commentary)
        // are unchanged.
        const validation = await pool.query(
            `
            SELECT
                b.name AS book,
                EXISTS (
                    SELECT 1 FROM bible_translations WHERE abbreviation = $2
                ) AS translation_exists,
                CASE
                    WHEN $3::bigint IS NULL THEN true
                    ELSE EXISTS (
                        SELECT 1 FROM commentaries WHERE id = $3
                    )
                END AS commentary_exists
            FROM bible_books b
            WHERE b.id = $1
            `,
            [bookId, translation, commentaryId ?? null]
        );

        if (validation.rows.length === 0) {
            return res.status(400).json({
                error: "The book does not exist."
            });
        }

        if (!validation.rows[0].translation_exists) {
            return res.status(400).json({
                error: "The translation does not exist."
            });
        }

        if (!validation.rows[0].commentary_exists) {
            return res.status(400).json({
                error: "The commentary does not exist."
            });
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
            book: validation.rows[0].book
        });
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Failed to save reading position."
        });
    }
};

module.exports = {
    getReadingState,
    saveReadingState
};
