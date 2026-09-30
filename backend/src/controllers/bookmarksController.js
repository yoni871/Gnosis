const pool = require("../db/db");
const isValidPassageRange = (
    startChapter,
    startVerse,
    endChapter,
    endVerse
) => {
    const values = [
        startChapter,
        startVerse,
        endChapter,
        endVerse
    ];

    const allPositiveIntegers = values.every((value) => {
        return Number.isInteger(value) && value > 0;
    });

    if (!allPositiveIntegers) {
        return false;
    }

    return (
        endChapter > startChapter ||
        (
            endChapter === startChapter &&
            endVerse >= startVerse
        )
    );
};

const createBookmark = async (req, res) => {
    const userId = req.user.userId;

    const { bookId, startChapter, startVerse, endChapter, endVerse } = req.body;

    if (
        !bookId ||
        !startChapter ||
        !startVerse ||
        !endChapter ||
        !endVerse
    ) {
        return res.status(400).json({
            error: "All bookmark fields are required."
        });
    }

    if (
        !Number.isInteger(bookId) ||
        bookId <= 0 ||
        !isValidPassageRange(
            startChapter,
            startVerse,
            endChapter,
            endVerse
        )
    ) {
        return res.status(400).json({
            error: "The bookmark passage is invalid."
        });
    }

    try {
        const result = await pool.query(
            `
            INSERT INTO bookmarks (
                user_id,
                book_id,
                start_chapter,
                start_verse,
                end_chapter,
                end_verse
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            `,
            [
                userId,
                bookId,
                startChapter,
                startVerse,
                endChapter,
                endVerse
            ]
        );

        return res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({
                error: "This passage is already bookmarked."
            });
        }

        console.error(error);

        return res.status(500).json({
            error: "Failed to create bookmark."
        });
    }
};

const getBookmarks = async (req, res) => {
    const userId = req.user.userId;

    try {
        const result = await pool.query(
            `
            SELECT
                bookmarks.*,
                bible_books.name AS book
            FROM bookmarks
            JOIN bible_books
                ON bookmarks.book_id = bible_books.id
            WHERE bookmarks.user_id = $1
            ORDER BY bookmarks.created_at DESC
            `,
            [userId]
        );

        return res.status(200).json(result.rows);
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Failed to retrieve bookmarks."
        });
    }
};

const getBookmarkById = async (req, res) => {
    const userId = req.user.userId;
    const bookmarkId = req.params.id;

    try {
        const result = await pool.query(
            `
            SELECT
                bookmarks.*,
                bible_books.name AS book
            FROM bookmarks
            JOIN bible_books
                ON bookmarks.book_id = bible_books.id
            WHERE bookmarks.id = $1
            AND bookmarks.user_id = $2
            `,
            [bookmarkId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Bookmark not found."
            });
        }

        return res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Failed to retrieve bookmark."
        });
    }   
};

const updateBookmark = async (req, res) => {
    const userId = req.user.userId;
    const bookmarkId = req.params.id;

    const {
        bookId,
        startChapter,
        startVerse,
        endChapter,
        endVerse
    } = req.body;

    if (
        !bookId ||
        !startChapter ||
        !startVerse ||
        !endChapter ||
        !endVerse
    ) {
        return res.status(400).json({
            error: "All bookmark fields are required."
        });
    }

    if (
        !Number.isInteger(bookId) ||
        bookId <= 0 ||
        !isValidPassageRange(
            startChapter,
            startVerse,
            endChapter,
            endVerse
        )
    ) {
        return res.status(400).json({
            error: "The bookmark passage is invalid."
        });
    }

    try {
        const result = await pool.query(
            `
            UPDATE bookmarks
            SET
                book_id = $1,
                start_chapter = $2,
                start_verse = $3,
                end_chapter = $4,
                end_verse = $5
            WHERE id = $6
            AND user_id = $7
            RETURNING *
            `,
            [
                bookId,
                startChapter,
                startVerse,
                endChapter,
                endVerse,
                bookmarkId,
                userId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Bookmark not found."
            });
        }

        return res.status(200).json(result.rows[0]);

    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({
                error: "This passage is already bookmarked."
            });
        }

        console.error(error);

        return res.status(500).json({
            error: "Failed to update bookmark."
        });
    }
};

const deleteBookmark = async (req, res) => {
    const userId = req.user.userId;
    const bookmarkId = req.params.id;

    try {
        const result = await pool.query(
            `
            DELETE FROM bookmarks
            WHERE id = $1
            AND user_id = $2
            RETURNING *
            `,
            [bookmarkId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Bookmark not found."
            });
        }

        return res.status(200).json({
            message: "Bookmark deleted successfully."
        });
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Failed to delete bookmark."
        });
    }
};

module.exports = {
    createBookmark,
    getBookmarks,
    getBookmarkById,
    updateBookmark,
    deleteBookmark
};