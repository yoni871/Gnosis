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
// `withUser` borrows one client and owns the transaction. Code that already
// owns a transaction (withUserBudget and saveHighlights) calls
// setUserContext on that same client immediately after BEGIN. The setting is
// transaction-local, so COMMIT or ROLLBACK clears it before release.

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
    let broken = false;
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
            // Discard a connection with an uncertain transaction state.
            broken = true;
        }
        throw error;
    } finally {
        client.release(broken);
    }
}

module.exports = { withUser, setUserContext };
