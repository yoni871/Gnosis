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
