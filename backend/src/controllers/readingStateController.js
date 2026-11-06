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
        const book = await pool.query(
            "SELECT id FROM bible_books WHERE id = $1",
            [bookId]
        );

        if (book.rows.length === 0) {
            return res.status(400).json({
                error: "The book does not exist."
            });
        }

        const translationRow = await pool.query(
            "SELECT abbreviation FROM bible_translations WHERE abbreviation = $1",
            [translation]
        );

        if (translationRow.rows.length === 0) {
            return res.status(400).json({
                error: "The translation does not exist."
            });
        }

        if (commentaryId !== undefined && commentaryId !== null) {
            const commentary = await pool.query(
                "SELECT id FROM commentaries WHERE id = $1",
                [commentaryId]
            );

            if (commentary.rows.length === 0) {
                return res.status(400).json({
                    error: "The commentary does not exist."
                });
            }
        }

        await pool.query(
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

        const result = await pool.query(SELECT_READING_STATE, [userId]);

        return res.status(200).json(result.rows[0]);
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
