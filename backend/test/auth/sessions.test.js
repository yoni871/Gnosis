const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
process.env.GNOSIS_TEST_ISOLATION = '1';
// Keep main's long JWT_SECRET (PR #81 secret-strength boot check) and
// add the RATE_LIMIT_KEY_SECRET the family budget needs (PR #90).
process.env.JWT_SECRET = 'synthetic-session-test-secret-synthetic-test-secret';
process.env.RATE_LIMIT_KEY_SECRET = 'synthetic-session-rate-limit-secret';
process.env.FRONTEND_URL = 'https://frontend.example.invalid';
const pool = require('../../src/db/db');
const sessions = require('../../src/services/sessionService');
const authenticate = require('../../src/middleware/authMiddleware');
let behavior, queries, released;
const connect = test.mock.method(pool, 'connect', async () => ({
    query: async (sql, args) => { queries.push([sql, args]); return behavior(sql, args); },
    release: () => { released++; },
}));
const query = test.mock.method(pool, 'query', async (sql, args) => { queries.push([sql, args]); return behavior(sql, args); });
test.beforeEach(() => { queries = []; released = 0; behavior = async () => ({ rows: [] }); });
test.after(async () => { connect.mock.restore(); query.mock.restore(); await pool.end(); });
function response() {
    return { statusCode: 200, status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; } };
}
const id = '00000000-0000-4000-8000-000000000001';
function rotationFixture(used = false, overrides = {}) {
    behavior = async sql => {
        if (sql.includes('SELECT s.*')) return { rows: [{ id, user_id: 7, expires_at: new Date(Date.now() + 600000), revoked_at: null, ...overrides }] };
        if (sql.includes('SELECT u.email, m.enrolled')) return { rows: [{ email: 'user@example.invalid', enrolled: false }] };
        if (sql.includes('INSERT INTO rate_limit_attempts')) return { rows: [{ id: 1 }] };
        if (sql.includes('COUNT(*)')) return { rows: [{ count: overrides.full ? 31 : 1, oldest: new Date() }] };
        if (sql.includes('SELECT used_at')) return { rows: [{ used_at: used ? new Date() : null }] };
        return { rows: [] };
    };
}
test('login issues a scoped 15-minute JWT and stores only a refresh hash atomically', async () => {
    behavior = async () => ({ rows: [{ password_hash: 'verified-hash' }] });
    const result = await sessions.createSession(7, 'verified-hash');
    const claims = jwt.verify(result.token, process.env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'gnosis', audience: 'gnosis-api' });
    assert.equal(claims.userId, 7);
    assert.equal(claims.exp - claims.iat, 900);
    assert.match(claims.sid, /^[a-f0-9-]{36}$/);
    const insert = queries.find(([sql]) => sql.includes('INSERT INTO auth_refresh_tokens'));
    assert.equal(insert[1][0], sessions.hash(result.refresh));
    assert.ok(!JSON.stringify(queries).includes(result.refresh));
    assert.equal(queries.at(-1)[0], 'COMMIT');
    assert.equal(released, 1);
});
test('a failed session insert rolls back and releases the connection', async () => {
    behavior = async sql => { if (sql.includes('INSERT')) throw new Error('synthetic'); return { rows: [{ password_hash: 'verified-hash' }] }; };
    await assert.rejects(sessions.createSession(7, 'verified-hash'));
    assert.equal(queries.at(-1)[0], 'ROLLBACK');
    assert.equal(released, 1);
});
test('refresh consumes the old hash and inserts a new one under a session lock', async () => {
    rotationFixture();
    const refresh = 'a'.repeat(64);
    const result = await sessions.rotateSession(refresh);
    assert.notEqual(result.refresh, refresh);
    assert.match(queries[1][0], /FOR UPDATE OF s/);
    assert.ok(queries.some(([sql]) => sql.includes('SET used_at')));
    assert.equal(queries.find(([sql]) => sql.includes('INSERT INTO auth_refresh_tokens'))[1][0], sessions.hash(result.refresh));
});
test('reuse of a consumed refresh token commits revocation of the whole family', async () => {
    rotationFixture(true);
    assert.equal(await sessions.rotateSession('a'.repeat(64)), null);
    assert.ok(queries.some(([sql]) => sql.includes('SET revoked_at')));
    // The audit row lands after the revocation commits, never inside
    // the transaction: it records the committed reuse, and an audit
    // failure cannot roll the revocation back.
    const commitIndex = queries.findIndex(([sql]) => sql === 'COMMIT');
    const auditIndex = queries.findIndex(([sql]) => sql.includes('INSERT INTO security_events'));
    assert.ok(commitIndex >= 0 && auditIndex > commitIndex);
    assert.deepEqual(queries[auditIndex][1], ['refresh_token.reused', 7]);
    assert.ok(!queries.some(([sql]) => sql.includes('INSERT INTO auth_refresh_tokens')));
});
test('expired or revoked sessions cannot refresh', async () => {
    for (const overrides of [{ revoked_at: new Date() }, { expires_at: new Date(0) }]) {
        rotationFixture(false, overrides);
        assert.equal(await sessions.rotateSession('a'.repeat(64)), null);
    }
});
test('malformed refresh tokens never reach the database', async () => {
    for (const value of [null, '', 'a'.repeat(65), {}, 'x'.repeat(64)]) assert.equal(await sessions.rotateSession(value), null);
    assert.equal(queries.length, 0);
});
test('logout can revoke through an already consumed refresh token', async () => {
    await sessions.revokeRefresh('b'.repeat(64));
    assert.match(queries[0][0], /SET revoked_at/);
    assert.equal(queries[0][1][0], sessions.hash('b'.repeat(64)));
});
test('cookie has production security attributes and does not expose the refresh token in JSON', () => {
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
        sessions.setCookie({ cookie(name, value, options) {
            assert.equal(name, 'gnosisRefresh'); assert.equal(value, 'synthetic');
            assert.equal(options.httpOnly, true); assert.equal(options.secure, true);
            assert.equal(options.sameSite, 'strict'); assert.equal(options.path, '/api/auth');
        } }, 'synthetic');
    } finally { if (saved === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved; }
});
test('cookie mutation rejects foreign origins and missing CSRF header', () => {
    for (const headers of [{ origin: process.env.FRONTEND_URL }, { origin: 'https://evil.invalid', 'x-gnosis-session': '1' }]) {
        const res = response(); sessions.browserSessionRequest({ headers }, res, () => assert.fail('must reject'));
        assert.equal(res.statusCode, 403);
    }
});
test('legacy stateless tokens are rejected before querying the database', async () => {
    const token = jwt.sign({ userId: 7 }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const res = response();
    await authenticate({ headers: { authorization: `Bearer ${token}` } }, res, () => assert.fail('must reject'));
    assert.equal(res.statusCode, 403); assert.equal(queries.length, 0);
});
test('protected requests reject revoked sessions and accept active sessions', async () => {
    const token = jwt.sign({ userId: 7, sid: id }, process.env.JWT_SECRET, { expiresIn: '15m', issuer: 'gnosis', audience: 'gnosis-api' });
    let next = false;
    const req = { headers: { authorization: `Bearer ${token}` } };
    const denied = response();
    await authenticate(req, denied, () => { next = true; });
    assert.equal(denied.statusCode, 403); assert.equal(next, false);
    behavior = async () => ({ rows: [{ id }] });
    await authenticate(req, response(), () => { next = true; });
    assert.equal(next, true); assert.equal(req.user.userId, 7);
    assert.match(queries[0][0], /revoked_at IS NULL AND expires_at > now\(\)/);
});

test('logout revokes a signed expired access credential but ignores forged credentials', async () => {
    const token = jwt.sign({ userId: 7, sid: id }, process.env.JWT_SECRET,
        { expiresIn: -1, issuer: 'gnosis', audience: 'gnosis-api' });
    await sessions.revokeAccess(`Bearer ${token}`);
    assert.deepEqual(queries[0][1], [id, 7]);
    queries = [];
    await sessions.revokeAccess('Bearer forged');
    assert.equal(queries.length, 0);
});

test('session issuance refuses a password changed after login verification, missing users and missing snapshots', async () => {
    for (const rows of [[], [{ password_hash: 'new-hash' }]]) {
        behavior = async () => ({ rows });
        assert.equal(await sessions.createSession(7, 'old-hash'), null);
        assert.ok(!queries.some(([sql]) => sql.includes('INSERT')));
        queries = [];
    }
    behavior = async () => ({ rows: [{ password_hash: 'new-hash' }] });
    assert.equal(await sessions.createSession(7), null);
    assert.ok(!queries.some(([sql]) => sql.includes('INSERT')));
});

test('family budget rejection leaves the current credential usable and does not issue tokens', async () => {
    rotationFixture(false, { full: true });
    const result = await sessions.rotateSession('a'.repeat(64));
    assert.equal(result.limited, true);
    assert.ok(result.retryAfter > 0);
    assert.ok(!queries.some(([sql]) => sql.includes('SET used_at') || sql.includes('INSERT INTO auth_refresh_tokens') || sql.includes('SET revoked_at')));
    assert.equal(queries.at(-1)[0], 'COMMIT');
});
