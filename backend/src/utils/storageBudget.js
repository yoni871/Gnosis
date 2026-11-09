const pool = require('../db/db');
const { publicError } = require('./privatePages');
const LIMITS = Object.freeze({ notes: 1000, bookmarks: 2000, highlights: 10000 });
const NOTE_BYTES = 2 * 1024 * 1024;
const COUNTS = {
    notes: 'SELECT COUNT(*)::int AS count, COALESCE(SUM(octet_length(content)),0)::bigint AS bytes FROM notes WHERE user_id=$1',
    bookmarks: 'SELECT COUNT(*)::int AS count FROM bookmarks WHERE user_id=$1',
    highlights: 'SELECT COUNT(*)::int AS count FROM highlights WHERE user_id=$1',
};
async function lockBudget(client, userId) { await client.query('SELECT pg_advisory_xact_lock(844761, $1)', [userId]); }
async function ensureCapacity(client, userId, resource, { add = 0, bytes = 0 } = {}) {
    if (!Object.hasOwn(COUNTS, resource)) throw new Error('Unknown saved-data resource.');
    const row = (await client.query(COUNTS[resource], [userId])).rows[0];
    const count = Number(row?.count), total = resource === 'notes' ? Number(row?.bytes) : 0;
    if (!Number.isSafeInteger(count) || !Number.isSafeInteger(total)) throw new Error('Invalid saved-data budget state.');
    if ((add > 0 && count + add > LIMITS[resource]) || (bytes > 0 && total + bytes > NOTE_BYTES)) {
        throw publicError('RESOURCE_LIMIT', 'Saved-data limit reached. Delete older items before adding more.', 409);
    }
}
async function withUserBudget(userId, work) {
    const client = await pool.connect();
    let broken = false;
    try {
        await client.query('BEGIN'); await lockBudget(client, userId);
        const result = await work(client);
        await client.query('COMMIT'); return result;
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch { broken = true; }
        throw error;
    } finally { client.release(broken); }
}
module.exports = { LIMITS, NOTE_BYTES, lockBudget, ensureCapacity, withUserBudget };
