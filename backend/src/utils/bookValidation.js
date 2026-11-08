// Cross-project reference check.
//
// notes, bookmarks, highlights and reading state keep book_id as a plain
// integer: no foreign key crosses the project boundary (bible_books lives
// in the Bible project), so writers validate the book against the Bible
// pool before inserting or updating. In a single-database deployment the
// Bible pool is the same instance as the application pool.
const { biblePool } = require("../db/db");

async function bookExists(bookId) {
    const result = await biblePool.query(
        "SELECT 1 FROM bible_books WHERE id = $1",
        [bookId]
    );
    return result.rows.length > 0;
}

module.exports = { bookExists };
