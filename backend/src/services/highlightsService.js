const pool = require("../db/db");

// Remove duplicate coordinates before validating and saving the selection.
function uniqueVerses(verses) {
    const byVerse = new Map();

    for (const point of verses) {
        const key = `${point.chapter}:${point.verse}`;
        byVerse.set(key, point);
    }

    return [...byVerse.values()];
}

async function saveHighlights(userId, bookId, verses, color) {
    // Process each selected coordinate only once.
    const selected = uniqueVerses(verses);

    //borrow one connection for all operations in this transaction
    const client = await pool.connect();
    try {
        //start group of database operations that succeed or fail
        await client.query("BEGIN");

        // Verify every selected coordinate against the stored Bible verses.
        const found = await client.query(
            `
            SELECT DISTINCT c.chapter_number AS chapter, v.verse_number AS verse
            FROM jsonb_to_recordset($2::jsonb)
                AS selected(chapter integer, verse integer)
            JOIN bible_chapters c
                ON c.book_id = $1
                AND c.chapter_number = selected.chapter
            JOIN bible_verses v
                ON v.chapter_id = c.id
                AND v.verse_number = selected.verse
            `,
            [bookId, JSON.stringify(selected)]
        );

        // Reject the entire operation if any selected verse is missing.
        if (found.rows.length !== selected.length) {
            const error = new Error("One or more selected verses do not exist.");
            error.code = "INVALID_PASSAGE";
            throw error;
        }

        // Insert or recolor only the exact coordinates the user selected.
        const result = await client.query(
            `
            INSERT INTO highlights (
                user_id, book_id, chapter, verse, color
            )
            SELECT
                $1::integer,
                $2::integer,
                selected.chapter,
                selected.verse,
                $4::varchar
            FROM jsonb_to_recordset($3::jsonb)
                AS selected(chapter integer, verse integer)
            WHERE true
            ORDER BY selected.chapter, selected.verse
            ON CONFLICT (user_id, book_id, chapter, verse)
            DO UPDATE SET
                color = EXCLUDED.color,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
            `,
            [userId, bookId, JSON.stringify(selected), color.toUpperCase()]
        );

        await client.query("COMMIT");

        return result.rows;
    } catch (error) {
        try {
            // Attempt to undo the transaction after a failure.
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            // Record cleanup failure without replacing the original error.
            console.error("Highlight rollback failed:", rollbackError);
        }

        throw error;
    } finally {
        client.release();
    }
}

// Load only the highlights belonging to the supplied authenticated user.
async function getHighlights(userId) {
    const result = await pool.query(
        `
        SELECT h.*, b.name AS book
        FROM highlights h
        JOIN bible_books b ON h.book_id = b.id
        WHERE h.user_id = $1
        ORDER BY b.book_order, h.chapter, h.verse
        `,
        [userId]
    );

    // Return an empty array when the user has no highlights.
    return result.rows;
}

// Delete a highlight only when it belongs to the authenticated user.
async function deleteHighlight(userId, highlightId) {
    const result = await pool.query(
        `
        DELETE FROM highlights
        WHERE id = $1
        AND user_id = $2
        RETURNING *
        `,
        [highlightId, userId]
    );

    // Return the removed record, or null if no owned record matched.
    return result.rows[0] || null;
}

// Clear only the exact selected coordinates belonging to this user.
async function deleteHighlightsInPassage(userId, bookId, verses) {
    const selected = uniqueVerses(verses);

    const result = await pool.query(
        `
        DELETE FROM highlights h
        USING jsonb_to_recordset($3::jsonb)
            AS selected(chapter integer, verse integer)
        WHERE h.user_id = $1
        AND h.book_id = $2
        AND h.chapter = selected.chapter
        AND h.verse = selected.verse
        RETURNING h.*
        `,
        [userId, bookId, JSON.stringify(selected)]
    );

    return result.rows;
}

module.exports = {
    saveHighlights,
    getHighlights,
    deleteHighlight,
    deleteHighlightsInPassage
}