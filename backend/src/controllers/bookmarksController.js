const { withUserBudget, ensureCapacity } = require("../utils/storageBudget");
const { withUser } = require("../db/userContext");
const { readPage, pageRows, sendPage, knownResourceError } = require("../utils/privatePages");
const pool = require("../db/db");
const { biblePool } = require("../db/db");
const { bookExists } = require("../utils/bookValidation");
const { logControllerError } = require("../utils/authErrors");
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

// Book names come from the Bible project (no join crosses the project
// boundary). Rows whose book is missing are dropped, as the old join did.
async function withBookNames(rows) {
    if (rows.length === 0) return [];
    const bookIds = [...new Set(rows.map(row => row.book_id))];
    const books = await biblePool.query(
        "SELECT id, name FROM bible_books WHERE id = ANY($1)",
        [bookIds]
    );
    const byId = new Map(books.rows.map(book => [book.id, book.name]));
    return rows
        .filter(row => byId.has(row.book_id))
        .map(row => ({ ...row, book: byId.get(row.book_id) }));
}

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
        // bookmarks keep book_id as a plain integer (no foreign key
        // crosses the project boundary): validate it against the Bible
        // project before writing.
        if (!(await bookExists(bookId))) {
            return res.status(400).json({
                error: "Unknown book."
            });
        }

        // One transaction owns both the RLS context and the budget
        // lock: withUser opens it, withUserBudget runs inside it on the
        // same client (see storageBudget.js — never nest the two
        // no-client forms, the inner COMMIT would clear the context).
        const result = await withUser(pool, userId, client => withUserBudget(userId, async budgetClient => {
            await ensureCapacity(budgetClient, userId, "bookmarks", { add: 1 });
            return budgetClient.query(
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
        }, client));

        return res.status(201).json(result.rows[0]);
    } catch (error) {
        if (knownResourceError(error, res)) return;
        if (error.code === "23505") {
            return res.status(409).json({
                error: "This passage is already bookmarked."
            });
        }

        logControllerError("bookmarks.create", "database", error);

        return res.status(500).json({
            error: "Failed to create bookmark."
        });
    }
};

const getBookmarks = async (req, res) => {
    const userId = req.user.userId;

    // F04: the list was unbounded. Same limit/offset convention as notes
    // and search; the applied values ride on headers.

    try {
        const page = readPage(req, "bookmarks");
        const result = await withUser(pool, userId, client => client.query(
            `
            SELECT bookmarks.*
            FROM bookmarks
            WHERE bookmarks.user_id = $1 AND ($2::integer IS NULL OR bookmarks.id < $2)
            AND ($4::integer IS NULL OR bookmarks.book_id=$4)
            AND ($5::integer IS NULL OR (bookmarks.start_chapter <= $5 AND bookmarks.end_chapter >= $5))
            ORDER BY bookmarks.id DESC LIMIT $3
            `,
            [userId, page.cursor, page.limit + 1, page.bookId, page.chapter]
        ));

        const resultPage = pageRows(result.rows, page.limit);
        resultPage.items = await withBookNames(resultPage.items);
        return sendPage(res, resultPage, page);
    } catch (error) {
        if (knownResourceError(error, res)) return;
        logControllerError("bookmarks.list", "database", error);

        return res.status(500).json({
            error: "Failed to retrieve bookmarks."
        });
    }
};

const getBookmarkById = async (req, res) => {
    const userId = req.user.userId;
    const bookmarkId = req.params.id;

    try {
        const result = await withUser(pool, userId, client => client.query(
            `
            SELECT bookmarks.*
            FROM bookmarks
            WHERE bookmarks.id = $1
            AND bookmarks.user_id = $2
            `,
            [bookmarkId, userId]
        ));

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Bookmark not found."
            });
        }

        // A bookmark whose book is missing from the Bible project is
        // gone, as the old join returned no row for it: 404, not a
        // 200 with an empty body.
        const bookmarks = await withBookNames(result.rows);
        if (bookmarks.length === 0) {
            return res.status(404).json({
                error: "Bookmark not found."
            });
        }

        return res.status(200).json(bookmarks[0]);
    } catch (error) {
        if (knownResourceError(error, res)) return;
        logControllerError("bookmarks.get", "database", error);

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
        // A supplied book_id is validated against the Bible project
        // before the update (bookmarks keep book_id as a plain integer).
        if (!(await bookExists(bookId))) {
            return res.status(400).json({
                error: "Unknown book."
            });
        }

        const result = await withUser(pool, userId, client => client.query(
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
        ));

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Bookmark not found."
            });
        }

        return res.status(200).json(result.rows[0]);

    } catch (error) {
        if (knownResourceError(error, res)) return;
        if (error.code === "23505") {
            return res.status(409).json({
                error: "This passage is already bookmarked."
            });
        }

        logControllerError("bookmarks.update", "database", error);

        return res.status(500).json({
            error: "Failed to update bookmark."
        });
    }
};

const deleteBookmark = async (req, res) => {
    const userId = req.user.userId;
    const bookmarkId = req.params.id;

    try {
        const result = await withUser(pool, userId, client => client.query(
            `
            DELETE FROM bookmarks
            WHERE id = $1
            AND user_id = $2
            RETURNING *
            `,
            [bookmarkId, userId]
        ));

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Bookmark not found."
            });
        }

        return res.status(200).json({
            message: "Bookmark deleted successfully."
        });
    } catch (error) {
        if (knownResourceError(error, res)) return;
        logControllerError("bookmarks.delete", "database", error);

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