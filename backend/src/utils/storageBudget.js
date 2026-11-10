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
// Run `work(client)` with the per-user storage budget held by a
// transaction-scoped advisory lock, so the quota check and the write
// commit or roll back together and two concurrent creates for the same
// user cannot both pass the check.
//
// `client` is the composition seam with RLS (`withUser` in
// ../db/userContext.js, docs/RowLevelSecurity.md): both helpers own a
// transaction, and nesting them is NOT safe — an inner BEGIN inside an
// outer transaction is a no-op in PostgreSQL, while an inner COMMIT
// commits the outer transaction early and clears the transaction-local
// RLS context (`SET LOCAL app.user_id`), so later queries in the outer
// callback would run with no context. So exactly one helper owns the
// transaction: when the caller already holds one (a `withUser`
// callback), pass its client and this function takes the lock and runs
// the work on it without BEGIN/COMMIT; otherwise it opens its own
// transaction exactly as before. Call sites must never call the
// no-client form from inside a `withUser` callback.
async function withUserBudget(userId, work, client = null) {
    if (client) {
        await lockBudget(client, userId);
        return work(client);
    }
    const owned = await pool.connect();
    let broken = false;
    try {
        await owned.query('BEGIN'); await lockBudget(owned, userId);
        const result = await work(owned);
        await owned.query('COMMIT'); return result;
    } catch (error) {
        try { await owned.query('ROLLBACK'); } catch { broken = true; }
        throw error;
    } finally { owned.release(broken); }
}
module.exports = { LIMITS, NOTE_BYTES, lockBudget, ensureCapacity, withUserBudget };
