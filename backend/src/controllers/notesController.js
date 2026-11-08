const pool = require("../db/db");
const { bookExists } = require("../utils/bookValidation");

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
        console.error(error);

        return res.status(500).json({
            error: "Failed to create note."
        })
    }
};

const getNotes = async (req, res) => {
    const userId = req.user.userId;

    try {
        const result = await pool.query(
            `
            SELECT * FROM notes
            WHERE user_id = $1
            ORDER BY created_at DESC
            `,
            [userId]
        );

        return res.status(200).json(result.rows);
    } catch (error) {
        console.error(error);

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
        console.error(error);

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
        console.error(error);

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
        console.error(error);

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