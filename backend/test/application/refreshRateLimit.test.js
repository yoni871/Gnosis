const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { contextFromEnvironment, createTestPool } = require('../helpers/application-database');
const { startBackend, workerEnvironment } = require('../helpers/backend-instance');
const { computeKeyHash } = require('../../src/utils/rateLimit');
const context = contextFromEnvironment();
let database, first, second;
const secret = workerEnvironment().RATE_LIMIT_KEY_SECRET;
test.before(async () => { database = await createTestPool(context); first = await startBackend(context); second = await startBackend(context); });
test.beforeEach(async () => database.pool.query('DELETE FROM rate_limit_attempts'));
test.after(async () => { if (first) await first.stop(); if (second) await second.stop(); if (database) await database.close(); });
async function refresh(worker, value, forwarded = '198.51.100.7') {
    return fetch(worker.url + '/api/auth/refresh', { method: 'POST', headers: {
        'X-Gnosis-Session': '1', Cookie: `gnosisRefresh=${value}`,
        'X-Forwarded-For': forwarded, Connection: 'close' }, signal: AbortSignal.timeout(10000) });
}
test('two backend instances share a strict refresh-token budget during a concurrent spoofed-IP burst', async () => {
    const value = crypto.randomBytes(32).toString('hex');
    const responses = await Promise.all(Array.from({ length: 24 }, (_, i) => refresh(i % 2 ? first : second, value, `198.51.100.${i + 1}`)));
    assert.equal(responses.filter(r => r.status === 401).length, 10);
    assert.equal(responses.filter(r => r.status === 429).length, 14);
    assert.ok(responses.every(r => r.headers.get('cache-control') === 'no-store'));
    const rows = await database.pool.query("SELECT key_hash, policy FROM rate_limit_attempts WHERE policy LIKE 'refresh_%'");
    assert.equal(rows.rows.filter(r => r.policy === 'refresh_token').length, 10);
    assert.ok(!JSON.stringify(rows.rows).includes(value));
});
test('forwarded address changes cannot evade the real socket-IP budget', async () => {
    const hash = computeKeyHash('refresh_ip', ['127.0.0.1'], secret);
    await database.pool.query("INSERT INTO rate_limit_attempts(key_hash,policy) SELECT $1,'refresh_ip' FROM generate_series(1,120)", [hash]);
    const res = await refresh(second, crypto.randomBytes(32).toString('hex'), '203.0.113.99');
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get('retry-after')) > 0);
});
test('expired refresh-budget rows do not lock out a credential', async () => {
    const value = crypto.randomBytes(32).toString('hex');
    const hash = computeKeyHash('refresh_token', [value], secret);
    await database.pool.query("INSERT INTO rate_limit_attempts(key_hash,policy,attempted_at) SELECT $1,'refresh_token',now()-interval '61 seconds' FROM generate_series(1,10)", [hash]);
    assert.equal((await refresh(first, value)).status, 401);
});
test('successful real rotations spend quota and preserve replay detection', async () => {
    const password = 'synthetic-refresh-only-password';
    await database.pool.query("INSERT INTO users(email,password_hash,email_verified_at) VALUES ('refresh-budget@fixture.invalid',$1,now())", [await bcrypt.hash(password, 4)]);
    const login = await fetch(first.url + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'refresh-budget@fixture.invalid', password }) });
    assert.equal(login.status, 200);
    const value = login.headers.get('set-cookie').split(';')[0].split('=')[1];
    const renewed = await refresh(first, value);
    assert.equal(renewed.status, 200);
    assert.equal((await refresh(second, value)).status, 401);
    const count = await database.pool.query("SELECT count(*)::int AS n FROM rate_limit_attempts WHERE policy='refresh_ip'");
    assert.equal(count.rows[0].n, 2);
});

test('stable family quota survives rotation/IP changes and throttling preserves the current cookie', async () => {
    const password = 'synthetic-family-only-password';
    await database.pool.query("INSERT INTO users(email,password_hash,email_verified_at) VALUES ('family-budget@fixture.invalid',$1,now())", [await bcrypt.hash(password, 4)]);
    const login = await fetch(first.url + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'family-budget@fixture.invalid', password }) });
    const access = (await login.json()).token;
    const sid = require('jsonwebtoken').decode(access).sid;
    const value = login.headers.get('set-cookie').split(';')[0].split('=')[1];
    const key = computeKeyHash('refresh_family', [sid], secret);
    await database.pool.query("INSERT INTO rate_limit_attempts(key_hash,policy) SELECT $1,'refresh_family' FROM generate_series(1,30)", [key]);
    const blocked = await refresh(second, value, '203.0.113.77');
    assert.equal(blocked.status, 429); assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.equal(blocked.headers.get('set-cookie'), null);
    const state = await database.pool.query('SELECT used_at FROM auth_refresh_tokens WHERE token_hash=$1', [require('../../src/services/sessionService').hash(value)]);
    assert.equal(state.rows[0].used_at, null);
    await database.pool.query("DELETE FROM rate_limit_attempts WHERE key_hash=$1 AND policy='refresh_family'", [key]);
    assert.equal((await refresh(first, value)).status, 200);
});
