const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, require('../../scripts/test').testEnvironment(), {
    JWT_SECRET: 'synthetic-jwt-refresh-regression', RATE_LIMIT_KEY_SECRET: 'synthetic-rate-refresh-regression' });
const pool = require('../../src/db/db');
const sessions = require('../../src/services/sessionService');
const app = require('../../src/app');
let server, origin, failStore = false, failSecond = false, full = false;
const sql = [];
const client = { async query(query, params) {
    sql.push([query, params]);
    if (failStore || (failSecond && params?.[1] === 'refresh_token')) throw new Error('private-diagnostic');
    if (query.includes('INSERT INTO rate_limit_attempts')) return { rows: [{ id: sql.length }] };
    if (query.includes('COUNT(*)')) return { rows: [{ count: full ? 1000 : 1, oldest: new Date() }] };
    return { rows: [{ last_swept_at: new Date(), locked: true }] };
}, release() {} };
test.before(async () => {
    test.mock.method(pool, 'connect', async () => client);
    test.mock.method(pool, 'query', async (query, params) => { sql.push([query, params]); return { rows: [] }; });
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await pool.end(); });
test.beforeEach(() => { sql.length = 0; full = false; failStore = false; failSecond = false; });
async function refresh(cookie) {
    return fetch(origin + '/api/auth/refresh', { method: 'POST', headers: { 'X-Gnosis-Session': '1', Connection: 'close', ...(cookie ? { Cookie: cookie } : {}) } });
}
test('absent, malformed and duplicate refresh cookies do not touch the store or rotate', async t => {
    const rotate = t.mock.method(sessions, 'rotateSession', () => assert.fail('rotation must not run'));
    for (const cookie of [undefined, 'gnosisRefresh=bad', `gnosisRefresh=${'a'.repeat(64)}; gnosisRefresh=${'b'.repeat(64)}`]) {
        const res = await refresh(cookie);
        assert.equal(res.status, 401);
        assert.equal(res.headers.get('cache-control'), 'no-store');
    }
    assert.equal(sql.length, 0); assert.equal(rotate.mock.callCount(), 0);
});
test('budget rejection is uncached and cannot rotate the credential', async t => {
    full = true;
    const rotate = t.mock.method(sessions, 'rotateSession', () => assert.fail('rotation must not run'));
    const res = await refresh(`gnosisRefresh=${'a'.repeat(64)}`);
    assert.equal(res.status, 429); assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.ok(Number(res.headers.get('retry-after')) > 0);
    assert.equal(rotate.mock.callCount(), 0);
});
test('successful rotations count and raw refresh credentials never enter limiter SQL', async t => {
    t.mock.method(sessions, 'rotateSession', async () => ({ token: 'synthetic-access', refresh: 'b'.repeat(64) }));
    const res = await refresh(`gnosisRefresh=${'a'.repeat(64)}`);
    assert.equal(res.status, 200);
    assert.equal(sql.filter(([query]) => query.includes('INSERT INTO rate_limit_attempts')).length, 2);
    assert.ok(!sql.some(([query]) => query.startsWith('DELETE FROM rate_limit_attempts WHERE id =')));
    assert.ok(!JSON.stringify(sql).includes('a'.repeat(64)));
});
test('store outage fails closed before rotation with no diagnostics in the response', async t => {
    failStore = true;
    const rotate = t.mock.method(sessions, 'rotateSession', () => assert.fail('rotation must not run'));
    const res = await refresh(`gnosisRefresh=${'a'.repeat(64)}`);
    assert.equal(res.status, 500); assert.equal(rotate.mock.callCount(), 0);
    assert.ok(!(await res.text()).includes('private-diagnostic'));
});
test('internal rotation failures release both reservations', async t => {
    t.mock.method(sessions, 'rotateSession', async () => { throw new Error('private-diagnostic'); });
    const res = await refresh(`gnosisRefresh=${'a'.repeat(64)}`);
    assert.equal(res.status, 500);
    assert.equal(sql.filter(([query]) => query.startsWith('DELETE FROM rate_limit_attempts WHERE id =')).length, 2);
});

test('a second-policy store failure releases the first reserved bucket', async t => {
    failSecond = true;
    t.mock.method(sessions, 'rotateSession', () => assert.fail('rotation must not run'));
    const res = await refresh(`gnosisRefresh=${'a'.repeat(64)}`);
    assert.equal(res.status, 500);
    assert.equal(sql.filter(([query]) => query.startsWith('DELETE FROM rate_limit_attempts WHERE id =')).length, 1);
});
