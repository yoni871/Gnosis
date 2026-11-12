const pool = require('../db/db');
const { publicError } = require('./privatePages');
const LIMITS = Object.freeze({ notes: 1000, bookmarks: 2000, highlights: 10000 });
const NOTE_BYTES = 2 * 1024 * 1024;
const COUNTS = {
    notes: 'SELECT COUNT(*)::int AS count, COALESCE(SUM(octet_length(content)),0)::bigint AS bytes FROM notes WHERE user_id=$1',
    bookmarks: 'SELECT COUNT(*)::int AS count FROM bookmarks WHERE user_id=$1',
    highlights: 'SELECT COUNT(*)::int AS count FROM highlights WHERE user_id=$1',
};
// Bounded per-user budget lock (PR #91, following PR #114's rate-limiter
// pattern): the advisory lock is taken non-blockingly with
// pg_try_advisory_xact_lock and retried inside a 2-second window. The
// holder's transaction is milliseconds long, so a waiter normally
// acquires it after a few short retries. Only a lock held past the whole
// window (a stuck holder) yields a controlled 429 instead of an
// indefinite hang — no quota is consumed (nothing was written yet).
const LOCK_WAIT_TIMEOUT_MS = 2000;
const LOCK_RETRY_DELAY_MS = 10;
async function lockBudget(client, userId) {
    const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
    for (;;) {
        const lock = await client.query('SELECT pg_try_advisory_xact_lock(844761, $1) AS locked', [userId]);
        if (lock.rows[0]?.locked) return;
        if (Date.now() >= deadline) {
            throw publicError('RESOURCE_BUSY', 'Saved-data budget is busy. Please try again.', 429);
        }
        await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_DELAY_MS));
    }
}
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
