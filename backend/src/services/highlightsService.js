const { lockBudget, ensureCapacity } = require("../utils/storageBudget");
const { pageRows } = require("../utils/privatePages");
const pool = require("../db/db");
const { biblePool } = require("../db/db");
const { logControllerError } = require("../utils/authErrors");

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

    // The book must exist in the Bible project before anything is
    // written: highlights keep book_id as a plain integer (no foreign
    // key crosses the project boundary).
    const book = await biblePool.query(
        "SELECT 1 FROM bible_books WHERE id = $1",
        [bookId]
    );
    if (book.rows.length === 0) {
        const error = new Error("Unknown book.");
        error.code = "INVALID_PASSAGE";
        throw error;
    }

    // Verify every selected coordinate against the stored Bible verses
    // (Bible project). Verses are static reference data, so verifying
    // before the App transaction — instead of inside it, as before —
    // cannot observe a change the insert would miss.
    const found = await biblePool.query(
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

    //borrow one connection for all operations in this transaction
    const client = await pool.connect();
    try {
        //start group of database operations that succeed or fail
        await client.query("BEGIN");
        await lockBudget(client, userId);
        const existing = await client.query(`SELECT COUNT(*)::int AS count FROM highlights h
            JOIN jsonb_to_recordset($2::jsonb) AS p(chapter integer, verse integer)
            ON p.chapter=h.chapter AND p.verse=h.verse WHERE h.user_id=$1 AND h.book_id=$3`,
            [userId, JSON.stringify(selected), bookId]);
        const matched = Number(existing.rows[0]?.count);
        if (!Number.isSafeInteger(matched) || matched < 0 || matched > selected.length) throw new Error('Invalid highlight budget state.');
        await ensureCapacity(client, userId, 'highlights', { add: selected.length - matched });

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
            // Only route, kind, and safe code are logged (audit F02).
            logControllerError("highlights.save", "rollback-failed", rollbackError);
        }

        throw error;
    } finally {
        client.release();
    }
}

// Load only the highlights belonging to the supplied authenticated user.
// Book names come from the Bible project (no join crosses the project
// boundary); the rows are ordered by book order, then chapter, then
// verse, exactly as the old join did.
async function getHighlights(userId, page = null) {
    const config = page || { limit: 100, cursor: null, bookId: null, chapter: null };
    const result = await pool.query(
        `
        SELECT h.*
        FROM highlights h
        WHERE h.user_id = $1 AND ($2::integer IS NULL OR h.id < $2)
        AND ($4::integer IS NULL OR h.book_id=$4) AND ($5::integer IS NULL OR h.chapter=$5)
        ORDER BY h.id DESC LIMIT $3
        `,
        [userId, config.cursor, config.limit + 1, config.bookId, config.chapter]
    );

    // Return an empty array when the user has no highlights.
    const resultPage = pageRows(result.rows, config.limit);
    if (result.rows.length === 0) return page ? resultPage : [];
    const bookIds = [...new Set(resultPage.items.map(row => row.book_id))];
    const books = await biblePool.query(
        "SELECT id, name, book_order FROM bible_books WHERE id = ANY($1)",
        [bookIds]
    );
    const byId = new Map(books.rows.map(book => [book.id, book]));
    resultPage.items = resultPage.items
        .filter(row => byId.has(row.book_id))
        .map(row => ({ ...row, book: byId.get(row.book_id).name }));
    return page ? resultPage : resultPage.items;
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