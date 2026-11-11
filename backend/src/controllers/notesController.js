const pool = require("../db/db");
const { bookExists } = require("../utils/bookValidation");
const { logControllerError } = require("../utils/authErrors");
const { parsePagination } = require("../utils/pagination");

// The notes.content column is TEXT with no database-side bound, so the
// application caps it: 100,000 characters is far above any real study
// note and far below an abusive payload (and below the 100 KiB JSON body
// limit, so a max-length note can still arrive in one request).
const MAX_NOTE_CONTENT_LENGTH = 100_000;

function contentTooLong(content) {
    return typeof content === "string" && content.length > MAX_NOTE_CONTENT_LENGTH;
}

const createNote = async (req, res) => {
    const userId = req.user.userId;

    const {
        bookId,
        startChapter,
        startVerse,
        endChapter,
        endVerse,
        content
    } = req.body;

    if(
        !bookId ||
        !startChapter ||
        !startVerse ||
        !endChapter ||
        !endVerse ||
        !content
    ) {
        return res.status(400).json({
            error: "All note fields are required."
        })
    }

    if (contentTooLong(content)) {
        return res.status(400).json({
            error: "Note content is too long."
        });
    }

    try {
        // notes keep book_id as a plain integer (no foreign key crosses
        // the project boundary): validate it against the Bible project
        // before writing.
        if (!(await bookExists(bookId))) {
            return res.status(400).json({
                error: "Unknown book."
            });
        }

        const result = await pool.query(
            `
            INSERT INTO notes (
                user_id,
                book_id,
                start_chapter,
                start_verse,
                end_chapter,
                end_verse,
                content
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            `,
            [userId, bookId, startChapter, startVerse, endChapter, endVerse, content]
        );

        return res.status(201).json(result.rows[0]);
    } catch (error) {
        logControllerError("notes.create", "database", error);

        return res.status(500).json({
            error: "Failed to create note."
        })
    }
};

const getNotes = async (req, res) => {
    const userId = req.user.userId;

    // F04: the list was unbounded. Limit defaults to 100 and is capped
    // at 100 (same as search); the applied values ride on headers so a
    // client can see the cap without changing the array body.
    const { limit, offset } = parsePagination(req.query);

    try {
        const result = await pool.query(
            `
            SELECT * FROM notes
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            `,
            [userId, limit, offset]
        );

        return res.status(200)
            .set("X-Limit", String(limit))
            .set("X-Offset", String(offset))
            .json(result.rows);
    } catch (error) {
        logControllerError("notes.list", "database", error);

        return res.status(500).json({
            error: "Failed to retrieve notes."
        });
    }
}

const getNoteById = async (req, res) => {
    const userId = req.user.userId;
    const noteId = req.params.id;

    try {
        const result = await pool.query(
            `
            SELECT * FROM notes
            WHERE id = $1
            AND user_id = $2
            `,
            [noteId, userId]
        );

        if(result.rows.length === 0) {
            return res.status(404).json({
                error: "Note not found."
            });
        }

        return res.status(200).json(result.rows[0]);
    } catch (error) {
        logControllerError("notes.get", "database", error);

        return res.status(500).json({
            error: "Failed to retrieve note."
        });
    }
};

const updateNote = async (req, res) => {
    const userId = req.user.userId;
    const noteId = req.params.id;

    const {
        bookId,
        startChapter,
        startVerse,
        endChapter,
        endVerse,
        content
    } = req.body;

    if (
        bookId === undefined &&
        startChapter === undefined &&
        startVerse === undefined &&
        endChapter === undefined &&
        endVerse === undefined &&
        content === undefined
    ) {
        return res.status(400).json({
            error: "At least one field is required to update the note."
        });
    }

    if (contentTooLong(content)) {
        return res.status(400).json({
            error: "Note content is too long."
        });
    }

    try {
        // A supplied book_id is validated against the Bible project
        // before the update (notes keep book_id as a plain integer).
        if (bookId !== undefined && !(await bookExists(bookId))) {
            return res.status(400).json({
                error: "Unknown book."
            });
        }

        const result = await pool.query(
            `
            UPDATE notes
            SET
                book_id = COALESCE($1, book_id),
                start_chapter = COALESCE($2, start_chapter),
                start_verse = COALESCE($3, start_verse),
                end_chapter = COALESCE($4, end_chapter),
                end_verse = COALESCE($5, end_verse),
                content = COALESCE($6, content),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $7
            AND user_id = $8
            RETURNING *
            `,
            [bookId, startChapter, startVerse, endChapter, endVerse, content, noteId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Note not found."
            });
        }

        return res.status(200).json(result.rows[0]);

    } catch (error) {
        logControllerError("notes.update", "database", error);

        return res.status(500).json({
            error: "Failed to update note."
        });
    }
}

const deleteNote = async (req, res) => {
    const userId = req.user.userId;
    const noteId = req.params.id;

    try {
        const result = await pool.query (
            `
            DELETE FROM notes
            WHERE id = $1
            AND user_id = $2
            RETURNING *
            `,
            [noteId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Note not found."
            });
        }

        return res.status(200).json({
            message: "Note deleted successfully."
        });

    } catch (error) {
        logControllerError("notes.delete", "database", error);

        return res.status(500).json({
            error: "Failed to delete note."
        });
    }
}

module.exports = {
    createNote,
    getNotes,
    getNoteById,
    updateNote,
    deleteNote
}