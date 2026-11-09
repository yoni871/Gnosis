// Per-request row-level-security context (roadmap T2.5, docs/RowLevelSecurity.md).
//
// RLS is defence-in-depth behind the application's own user_id binding:
// every user-data query still carries `WHERE user_id = $1`, and the
// policies below are the backstop for a forgotten WHERE in a future
// route. The policies read `app.user_id` from the session, so the value
// must be set on the exact connection that runs the query, inside an
// explicit transaction — `SET LOCAL` outside a transaction is a no-op,
// and a session-level `SET` on a pooled client could leak one user's id
// into another user's request.
//
// `withUser` is the only way user-data code sets the context: it borrows
// one client, opens a transaction, sets the context with set_config(...,
// true) — the `true` makes it transaction-local, so COMMIT or ROLLBACK
// clears it before the client returns to the pool. There is no reset-on-
// release to forget, and no code path sets `app.user_id` any other way.

function assertUserId(userId) {
    if (!Number.isInteger(userId) || userId <= 0) {
        throw new Error('withUser requires a positive integer user id.');
    }
    return String(userId);
}

// Set the RLS context on a client that is already inside a transaction.
// Parameterized, so the id never enters the SQL text.
async function setUserContext(client, userId) {
    await client.query("SELECT set_config('app.user_id', $1, true)", [assertUserId(userId)]);
}

// Run `callback(client)` inside a transaction with the RLS context set
// to `userId`. The callback receives the borrowed client: every query it
// runs sees only that user's rows on the RLS tables (notes, bookmarks,
// highlights, user_reading_state). Reference reads against the Bible /
// Commentary pools stay outside the callback — they need no context.
// Rolls back on any failure and always releases the client.
async function withUser(pool, userId, callback) {
    // Validate before borrowing a client: a bad id fails without
    // touching the pool.
    assertUserId(userId);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await setUserContext(client, userId);
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            // The client is released below; a failed rollback must not
            // replace the original error.
        }
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { withUser, setUserContext };
