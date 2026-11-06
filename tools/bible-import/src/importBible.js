'use strict';
// The caller supplies a pool explicitly. This module never loads app configuration.
async function importBible(pool, { records, translationId, translationName }) {
    if (!Number.isSafeInteger(translationId) || translationId < 1 ||
        typeof translationName !== 'string' || !translationName.trim() || !Array.isArray(records)) {
        throw new Error('Explicit translation ID, exact name and parsed records are required.');
    }
    const client = await pool.connect();
    let began = false;
    try {
        await client.query('BEGIN'); began = true;
        // Serialize imports of this translation before checking existing verses.
        const translation = await client.query('SELECT name FROM bible_translations WHERE id=$1 FOR UPDATE', [translationId]);
        if (translation.rows.length !== 1 || translation.rows[0].name !== translationName) {
            throw new Error('Translation ID/name does not match an existing translation.');
        }
        const existing = await client.query('SELECT COUNT(*) FROM bible_verses WHERE translation_id=$1', [translationId]);
        if (Number(existing.rows[0].count) > 0) {
            await client.query('COMMIT'); began = false;
            return { status: 'skipped-existing', inserted: 0, unknownBooks: 0 };
        }
        const books = await client.query('SELECT id, name FROM bible_books');
        const bookMap = new Map(books.rows.map(book => [book.name, book.id]));
        const chapters = new Map();
        let inserted = 0, unknownBooks = 0;
        for (const record of records) {
            const bookId = bookMap.get(record.book);
            if (!bookId) { unknownBooks++; continue; }
            const key = `${bookId}-${record.chapter}`;
            if (!chapters.has(key)) {
                const chapter = await client.query(`INSERT INTO bible_chapters (book_id, chapter_number)
                    VALUES ($1,$2) ON CONFLICT (book_id,chapter_number)
                    DO UPDATE SET book_id=EXCLUDED.book_id RETURNING id`, [bookId, record.chapter]);
                chapters.set(key, chapter.rows[0].id);
            }
            await client.query(`INSERT INTO bible_verses (chapter_id,translation_id,verse_number,text)
                VALUES ($1,$2,$3,$4)`, [chapters.get(key), translationId, record.verse, record.text]);
            inserted++;
        }
        await client.query('COMMIT'); began = false;
        return { status: 'imported', inserted, unknownBooks };
    } catch (error) {
        if (began) {
            try { await client.query('ROLLBACK'); }
            catch { error.rollbackFailed = true; }
        }
        throw error;
    } finally { client.release(); }
}
module.exports = { importBible };
