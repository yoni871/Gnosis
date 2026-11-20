const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { contextFromEnvironment, createTestPool } = require('../helpers/application-database');
const { startBackend } = require('../helpers/backend-instance');
const context = contextFromEnvironment();
let database, worker, userId;
const password = 'synthetic-session-password';
test.before(async () => {
    database = await createTestPool(context);
    const result = await database.pool.query(`INSERT INTO users(first_name,last_name,email,password_hash,email_verified_at)
        VALUES ('Session','Reader','sessions@example.invalid',$1,now()) RETURNING id`, [await bcrypt.hash(password, 4)]);
    userId = result.rows[0].id;
    worker = await startBackend(context);
});
test.beforeEach(async () => { await database.pool.query('DELETE FROM rate_limit_attempts'); });
test.after(async () => { if (worker) await worker.stop(); if (database) await database.close(); });
async function post(path, cookie, token, body = {}) {
    const response = await fetch(`${worker.url}/api/auth/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gnosis-Session': '1',
            ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], data: text && response.status !== 204 ? JSON.parse(text) : null };
}
const login = () => post('login', null, null, { email: 'sessions@example.invalid', password });
async function profile(token) {
    return (await fetch(`${worker.url}/api/auth/profile`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) })).status;
}
test('rotation, replay detection and immediate access revocation use real PostgreSQL', async () => {
    const first = await login();
    assert.equal(first.status, 200);
    assert.equal(await profile(first.data.token), 200);
    const next = await post('refresh', first.cookie);
    assert.equal(next.status, 200); assert.notEqual(next.cookie, first.cookie);
    assert.equal((await post('refresh', first.cookie)).status, 401);
    assert.equal(await profile(next.data.token), 403);
    assert.equal((await post('refresh', next.cookie)).status, 401);
});
test('concurrent refreshes serialize and replay revokes the winning credential too', async () => {
    const first = await login();
    const results = await Promise.all([post('refresh', first.cookie), post('refresh', first.cookie)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
    assert.equal(await profile(results.find(r => r.status === 200).data.token), 403);
});
test('logout revokes one session; logout-all revokes every session for the account', async () => {
    const first = await login(), second = await login();
    assert.equal((await post('logout', first.cookie)).status, 204);
    assert.equal(await profile(first.data.token), 403);
    assert.equal(await profile(second.data.token), 200);
    const third = await login();
    assert.equal((await post('logout-all', null, second.data.token)).status, 204);
    assert.equal(await profile(second.data.token), 403);
    assert.equal(await profile(third.data.token), 403);
    assert.equal((await post('refresh', third.cookie)).status, 401);
});
test('absolute expiry prevents refresh and access, even before the JWT expires', async () => {
    const first = await login();
    await database.pool.query('UPDATE auth_sessions SET expires_at = now() - interval \'1 second\' WHERE user_id = $1', [userId]);
    assert.equal(await profile(first.data.token), 403);
    assert.equal((await post('refresh', first.cookie)).status, 401);
});

// Wait for an actual PostgreSQL lock wait, rather than relying on sleeps to
// assume that a concurrent request reached the critical section.
async function waitingFor(fragment) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
        const result = await database.pool.query(`SELECT 1 FROM pg_stat_activity
            WHERE usename = current_user AND pid <> pg_backend_pid()
            AND wait_event_type = 'Lock' AND position($1 in query) > 0`, [fragment]);
        if (result.rows.length) return;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail('Expected authentication request to wait for a database lock');
}
async function recovery() {
    const crypto = require('node:crypto');
    const token = crypto.randomBytes(32).toString('base64url');
    await database.pool.query(`INSERT INTO password_reset_tokens(user_id,token_hash,expires_at)
        VALUES ($1,$2,now() + interval '1 hour')`,
    [userId, crypto.createHash('sha256').update(token).digest()]);
    return token;
}
const reset = token => post('reset-password', null, null, { token, password: 'replacement-session-password' });
async function originalPassword() {
    await database.pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(password, 10), userId]);
}
async function rejected(credentials) {
    assert.equal(await profile(credentials.data.token), 403);
    assert.equal((await post('refresh', credentials.cookie)).status, 401);
}
test('reset invalidates all old access/refresh credentials and preserves other accounts', async () => {
    await originalPassword();
    const first = await login(), second = await login();
    const other = await database.pool.query(`INSERT INTO users(first_name,last_name,email,password_hash,email_verified_at)
        VALUES ('Other','Reader','other-session@example.invalid',$1,now()) RETURNING id`, [await bcrypt.hash(password, 10)]);
    assert.ok(other.rows[0].id);
    const unaffected = await post('login', null, null, { email: 'other-session@example.invalid', password });
    const token = await recovery();
    assert.equal((await reset(token)).status, 200);
    await rejected(first); await rejected(second);
    assert.equal(await profile(unaffected.data.token), 200);
    assert.equal((await post('refresh', unaffected.cookie)).status, 200);
    assert.equal((await login()).status, 401);
    const replacement = await post('login', null, null, { email: 'sessions@example.invalid', password: 'replacement-session-password' });
    assert.equal(replacement.status, 200);
    assert.equal(await profile(replacement.data.token), 200);
    assert.equal((await reset(token)).status, 400);
    assert.equal(await profile(replacement.data.token), 200, 'invalid reset must not revoke current sessions');
});
test('reset wins the account lock: a login with the old password snapshot cannot create a session', async () => {
    await originalPassword();
    const token = await recovery();
    const blocker = await database.pool.connect();
    let resetting, loggingIn;
    try {
        await blocker.query('BEGIN');
        await blocker.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
        resetting = reset(token);
        await waitingFor('SELECT id FROM users WHERE id = $1 FOR UPDATE');
        loggingIn = login();
        await waitingFor('SELECT password_hash, email FROM users WHERE id = $1 FOR UPDATE');
        await blocker.query('COMMIT');
        assert.equal((await resetting).status, 200);
        const result = await loggingIn;
        assert.equal(result.status, 401);
        assert.equal(result.cookie, undefined);
    } finally {
        await blocker.query('ROLLBACK'); blocker.release();
        await Promise.allSettled([resetting, loggingIn]);
    }
});
test('login wins the account lock: its newly inserted session is revoked by the waiting reset', async () => {
    await originalPassword();
    const token = await recovery();
    const blocker = await database.pool.connect();
    let loggingIn, resetting;
    try {
        await blocker.query('BEGIN');
        await blocker.query('LOCK TABLE auth_sessions IN SHARE MODE');
        loggingIn = login();
        await waitingFor('INSERT INTO auth_sessions');
        resetting = reset(token);
        await waitingFor('SELECT id FROM users WHERE id = $1 FOR UPDATE');
        await blocker.query('COMMIT');
        const credentials = await loggingIn;
        assert.equal(credentials.status, 200);
        assert.equal((await resetting).status, 200);
        await rejected(credentials);
    } finally {
        await blocker.query('ROLLBACK'); blocker.release();
        await Promise.allSettled([loggingIn, resetting]);
    }
});
test('refresh and reset serialize on the session family and leave no usable credential', async () => {
    await originalPassword();
    const credentials = await login();
    const token = await recovery();
    const results = await Promise.all([post('refresh', credentials.cookie), reset(token)]);
    assert.equal(results[1].status, 200);
    assert.ok([200, 401].includes(results[0].status));
    await rejected(credentials);
    if (results[0].status === 200) await rejected(results[0]);
});
