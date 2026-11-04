const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { contextFromEnvironment, createTestPool } = require('../helpers/application-database');
const { startBackend } = require('../helpers/backend-instance');
const { hashVerificationToken } = require('../../src/utils/verification');
const { RATE_LIMITED_BODY } = require('../../src/utils/rateLimit');

const context = contextFromEnvironment(); // Fail before any connection if run directly.
const IP = '127.0.0.1';
const GENERIC_RESEND = { message: 'If there is an unverified account for this email, a new verification link has been sent.' };
const GENERIC_VERIFY = { error: 'Invalid or expired verification link.', code: 'INVALID_VERIFICATION_LINK' };
const PASSWORD = 'synthetic-password-1';

// The delivery stub stands in for Resend. Workers receive its loopback
// URL through RESEND_API_BASE_URL, which they honor only because they
// run isolated; production always uses api.resend.com.
let stubMode = 'ok'; // 'ok' | 'fail' | 'slow'
const delivered = [];
let database;
let worker;
let workerB;
let stub;
let stubUrl;
let emailCounter = 0;

test.before(async () => {
    database = await createTestPool(context);
    stub = http.createServer((req, res) => {
        res.on('error', () => {});
        if (req.method !== 'POST' || req.url !== '/emails') {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'not found' }));
            return;
        }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            const payload = JSON.parse(body);
            if (stubMode === 'fail') {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'synthetic provider failure' }));
                return;
            }
            const send = () => {
                delivered.push({ to: payload.to, html: payload.html, text: payload.text });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ id: 'synthetic-resend-id' }));
            };
            if (stubMode === 'slow') setTimeout(send, 6000);
            else send();
        });
    });
    await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
    stubUrl = `http://127.0.0.1:${stub.address().port}`;
    process.env.RESEND_API_BASE_URL = stubUrl;
    worker = await startBackend(context);
    workerB = await startBackend(context);
});
test.after(async () => {
    if (worker) await worker.stop();
    if (workerB) await workerB.stop();
    if (database) await database.close();
    if (stub) await new Promise(resolve => stub.close(resolve));
    delete process.env.RESEND_API_BASE_URL;
});

async function post(url, path, body, headers = {}) {
    const response = await fetch(`${url}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    return { status: response.status, retryAfter: response.headers.get('retry-after'), json: text ? JSON.parse(text) : null };
}
async function get(url, path, token) {
    const response = await fetch(`${url}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
    });
    return { status: response.status, json: await response.json() };
}
function freshEmail(tag) {
    emailCounter += 1;
    return `${tag}-${emailCounter}@example.invalid`;
}
async function register(url, email) {
    return post(url, '/api/auth/register', { firstName: 'Test', lastName: 'User', email, password: PASSWORD });
}
async function login(url, email, password = PASSWORD) {
    return post(url, '/api/auth/login', { email, password });
}
async function verify(url, token) {
    return post(url, '/api/auth/verify-email', { token });
}
async function resend(url, email) {
    return post(url, '/api/auth/resend-verification', { email });
}
function deliveredTo(email) {
    return delivered.filter(item => item.to === email);
}
function tokenFrom(email) {
    const items = deliveredTo(email);
    assert.ok(items.length > 0, `expected a delivered email for ${email}`);
    const match = items[items.length - 1].html.match(/#token=([A-Za-z0-9_-]{43})/);
    assert.ok(match, 'delivered email must carry a fragment verification link');
    return match[1];
}
async function userByEmail(email) {
    const result = await database.pool.query('SELECT * FROM users WHERE email=$1', [email]);
    return result.rows[0];
}
async function tokensFor(userId) {
    const result = await database.pool.query(
        'SELECT * FROM email_verification_tokens WHERE user_id=$1 ORDER BY id', [userId]);
    return result.rows;
}
async function unusedTokenCount(userId) {
    const result = await database.pool.query(
        "SELECT count(*)::int AS n FROM email_verification_tokens WHERE user_id=$1 AND consumed_reason IS NULL AND expires_at > now()",
        [userId]);
    return result.rows[0].n;
}
async function seedUser(email, verified) {
    const hash = await bcrypt.hash(PASSWORD, 10);
    const result = await database.pool.query(
        'INSERT INTO users(email, password_hash, first_name, last_name, email_verified_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [email, hash, 'Test', 'User', verified ? new Date() : null]);
    return result.rows[0].id;
}
async function seedToken(userId, token, expiresAtSql = "now() + interval '24 hours'") {
    const result = await database.pool.query(
        `INSERT INTO email_verification_tokens(user_id, token_hash, expires_at) VALUES ($1, $2, ${expiresAtSql}) RETURNING id`,
        [userId, hashVerificationToken(token)]);
    return result.rows[0].id;
}
function randomToken() {
    return crypto.randomBytes(32).toString('base64url');
}
async function resendIpCount() {
    const result = await database.pool.query(
        "SELECT count(*)::int AS n FROM rate_limit_attempts WHERE policy='resend_ip'");
    return result.rows[0].n;
}
async function verifyIpCount() {
    const result = await database.pool.query(
        "SELECT count(*)::int AS n FROM rate_limit_attempts WHERE policy='verify_ip'");
    return result.rows[0].n;
}
async function resetRateLimits() {
    // Section isolation only: the per-IP buckets are shared across this
    // file, so each section resets them before asserting its own counts.
    await database.pool.query('DELETE FROM rate_limit_attempts');
}

// Register is limited to 5/hour per IP, so only the tests that exercise
// the register path itself use it; every other account is seeded
// directly and every other token is forged with the same hash function.

test('full flow: register, login gate, verify, login, profile', async () => {
    const email = freshEmail('full-flow');
    const created = await register(worker.url, email);
    assert.equal(created.status, 200);
    assert.equal(created.json.email, email);
    assert.equal(deliveredTo(email).length, 1);
    const token = tokenFrom(email);
    const user = await userByEmail(email);
    assert.equal(user.email_verified_at, null);
    const rows = await tokensFor(user.id);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].token_hash, hashVerificationToken(token));
    assert.ok(!rows[0].token_hash.toString('hex').includes(token), 'no raw token in the stored row');
    const ttlMs = new Date(rows[0].expires_at) - new Date(rows[0].created_at);
    assert.ok(Math.abs(ttlMs - 24 * 60 * 60 * 1000) < 60 * 1000, `TTL must be 24h, got ${ttlMs}ms`);
    const gated = await login(worker.url, email);
    assert.equal(gated.status, 403);
    assert.deepEqual(gated.json, { error: 'Email not verified.', code: 'EMAIL_NOT_VERIFIED' });
    const verified = await verify(worker.url, token);
    assert.equal(verified.status, 200);
    assert.deepEqual(verified.json, { verified: true });
    const loggedIn = await login(worker.url, email);
    assert.equal(loggedIn.status, 200);
    assert.ok(loggedIn.json.token);
    const profile = await get(worker.url, '/api/auth/profile', loggedIn.json.token);
    assert.equal(profile.status, 200);
    assert.ok(profile.json.email_verified_at);
});

test('login gate leaves unknown and wrong-password responses identical', async () => {
    const email = freshEmail('gate');
    await seedUser(email, true);
    const unknown = await login(worker.url, freshEmail('gate-unknown'), 'wrong-password');
    const wrong = await login(worker.url, email, 'wrong-password');
    assert.equal(unknown.status, 401);
    assert.deepEqual(unknown.json, { error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
    assert.deepEqual(wrong.json, unknown.json);
});

test('duplicate registration keeps exactly one token', async () => {
    const email = freshEmail('duplicate');
    assert.equal((await register(worker.url, email)).status, 200);
    const again = await register(worker.url, email);
    assert.equal(again.status, 409);
    assert.deepEqual(again.json, { error: 'An account with that email already exists.', code: 'EMAIL_EXISTS' });
    const user = await userByEmail(email);
    assert.equal((await tokensFor(user.id)).length, 1);
    assert.equal(user.email_verified_at, null);
});

test('superseded token is generically invalid and the newest link works', async () => {
    const email = freshEmail('superseded');
    const userId = await seedUser(email, false);
    const oldToken = randomToken();
    await seedToken(userId, oldToken);
    const resent = await resend(worker.url, email);
    assert.equal(resent.status, 200);
    assert.deepEqual(resent.json, GENERIC_RESEND);
    const newToken = tokenFrom(email);
    assert.notEqual(newToken, oldToken);
    const stale = await verify(worker.url, oldToken);
    assert.equal(stale.status, 400);
    assert.deepEqual(stale.json, GENERIC_VERIFY);
    const fresh = await verify(worker.url, newToken);
    assert.equal(fresh.status, 200);
    const rows = await tokensFor(userId);
    assert.equal(rows.find(row => row.token_hash.equals(hashVerificationToken(oldToken))).consumed_reason, 'superseded');
    assert.equal(rows.find(row => row.token_hash.equals(hashVerificationToken(newToken))).consumed_reason, 'verified');
    assert.ok((await userByEmail(email)).email_verified_at);
});

test('expired and unknown tokens share the same generic 400', async () => {
    const email = freshEmail('expired');
    const userId = await seedUser(email, false);
    const expiredToken = randomToken();
    await seedToken(userId, expiredToken, "now() - interval '1 hour'");
    const expired = await verify(worker.url, expiredToken);
    assert.equal(expired.status, 400);
    assert.deepEqual(expired.json, GENERIC_VERIFY);
    assert.equal((await userByEmail(email)).email_verified_at, null);
    const unknown = await verify(worker.url, randomToken());
    assert.equal(unknown.status, 400);
    assert.deepEqual(unknown.json, GENERIC_VERIFY);
});

test('replaying the verified token succeeds without writing again', async () => {
    const email = freshEmail('replay');
    const userId = await seedUser(email, false);
    const token = randomToken();
    await seedToken(userId, token);
    assert.equal((await verify(worker.url, token)).status, 200);
    const before = (await tokensFor(userId))[0];
    const replay = await verify(worker.url, token);
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.json, { verified: true });
    const after = (await tokensFor(userId))[0];
    assert.equal(after.used_at.getTime(), before.used_at.getTime());
    assert.equal(after.consumed_reason, 'verified');
    assert.equal((await tokensFor(userId)).length, 1);
});

test('invalid resend and verify inputs consume no quota', async () => {
    const resendBefore = await resendIpCount();
    const verifyBefore = await verifyIpCount();
    for (const email of ['not-an-email', '', 'missing-at.example']) {
        const result = await resend(worker.url, email);
        assert.equal(result.status, 400);
    }
    for (const token of ['x', '', 'a'.repeat(42), 'has space in it']) {
        const result = await verify(worker.url, token);
        assert.equal(result.status, 400);
    }
    assert.equal(await resendIpCount(), resendBefore);
    assert.equal(await verifyIpCount(), verifyBefore);
    // A valid verify still works after the invalid batch.
    const email = freshEmail('invalid-then-valid');
    const userId = await seedUser(email, false);
    const token = randomToken();
    await seedToken(userId, token);
    assert.equal((await verify(worker.url, token)).status, 200);
});

test('provider failure preserves the account and a later resend succeeds', async () => {
    stubMode = 'fail';
    try {
        const email = freshEmail('provider-down');
        const created = await register(worker.url, email);
        assert.equal(created.status, 200);
        assert.equal(deliveredTo(email).length, 0);
        assert.equal((await userByEmail(email)).email_verified_at, null);
        assert.equal((await login(worker.url, email)).status, 403);
        stubMode = 'ok';
        const resent = await resend(worker.url, email);
        assert.equal(resent.status, 200);
        assert.deepEqual(resent.json, GENERIC_RESEND);
        assert.equal(deliveredTo(email).length, 1);
        assert.equal((await verify(worker.url, tokenFrom(email))).status, 200);
    } finally {
        stubMode = 'ok';
    }
});

test('provider timeout preserves the account', async () => {
    stubMode = 'slow';
    try {
        const email = freshEmail('provider-timeout');
        const started = Date.now();
        const created = await register(worker.url, email);
        const elapsed = Date.now() - started;
        assert.equal(created.status, 200);
        assert.ok(elapsed >= 5000 && elapsed < 15000, `register must wait out the 5s send timeout, took ${elapsed}ms`);
        assert.equal((await userByEmail(email)).email_verified_at, null);
    } finally {
        stubMode = 'ok';
    }
    const email = freshEmail('provider-timeout-retry');
    const userId = await seedUser(email, false);
    const token = randomToken();
    await seedToken(userId, token);
    // The slow stub never delivered, so a plain resend now works.
    assert.equal((await resend(worker.url, email)).status, 200);
    assert.equal(deliveredTo(email).length, 1);
});

async function raceRound(round) {
    // verify-vs-verify: both workers, same token, both succeed.
    {
        const email = freshEmail(`race-vv-${round}`);
        const userId = await seedUser(email, false);
        const token = randomToken();
        await seedToken(userId, token);
        const [a, b] = await Promise.all([verify(worker.url, token), verify(workerB.url, token)]);
        assert.equal(a.status, 200);
        assert.equal(b.status, 200);
        assert.ok((await userByEmail(email)).email_verified_at);
        assert.equal((await tokensFor(userId)).length, 1);
        assert.equal((await tokensFor(userId))[0].consumed_reason, 'verified');
    }
    // verify-vs-resend: exactly one of the two final states, never a 500.
    {
        const email = freshEmail(`race-vr-${round}`);
        const userId = await seedUser(email, false);
        const token = randomToken();
        await seedToken(userId, token);
        const [verified, resent] = await Promise.all([verify(worker.url, token), resend(workerB.url, email)]);
        assert.notEqual(verified.status, 500);
        assert.equal(resent.status, 200);
        assert.deepEqual(resent.json, GENERIC_RESEND);
        const user = await userByEmail(email);
        const rows = await tokensFor(userId);
        if (verified.status === 200) {
            assert.ok(user.email_verified_at, 'verify won: account verified');
            assert.equal(rows.find(row => row.token_hash.equals(hashVerificationToken(token))).consumed_reason, 'verified');
            assert.equal(await unusedTokenCount(userId), 0);
        } else {
            assert.equal(verified.status, 400, 'resend won: verify sees a superseded token');
            assert.deepEqual(verified.json, GENERIC_VERIFY);
            assert.equal(user.email_verified_at, null);
            assert.equal(rows.find(row => row.token_hash.equals(hashVerificationToken(token))).consumed_reason, 'superseded');
            assert.equal(await unusedTokenCount(userId), 1);
        }
    }
    // resend-vs-resend: both generic 200, exactly one valid token left.
    {
        const email = freshEmail(`race-rr-${round}`);
        const userId = await seedUser(email, false);
        const [a, b] = await Promise.all([resend(worker.url, email), resend(workerB.url, email)]);
        assert.equal(a.status, 200);
        assert.equal(b.status, 200);
        assert.deepEqual(a.json, GENERIC_RESEND);
        assert.deepEqual(b.json, GENERIC_RESEND);
        assert.equal(await unusedTokenCount(userId), 1);
        // Both sends completed (each handler awaits its send), so both
        // emails arrive even though only the newest link works.
        assert.equal(deliveredTo(email).length, 2);
    }
}

test('multi-worker races keep exactly one final state, with no deadlocks', async () => {
    for (let round = 1; round <= 3; round += 1) await raceRound(round);
});

test('uniform resend: unknown, verified, and unverified share one generic response and one per-email limit', async () => {
    await resetRateLimits();
    const bodies200 = [];
    const bodies429 = [];
    const states = [
        ['unknown', null],
        ['verified', true],
        ['unverified', false],
    ];
    for (const [state, verified] of states) {
        const email = freshEmail(`uniform-${state}`);
        let userId = null;
        if (verified !== null) userId = await seedUser(email, verified);
        if (verified === false) {
            const token = randomToken();
            await seedToken(userId, token);
        }
        for (let i = 0; i < 5; i += 1) {
            const result = await resend(worker.url, email);
            assert.equal(result.status, 200, `${state} resend ${i + 1} must pass`);
            bodies200.push(result.json);
        }
        const blocked = await resend(worker.url, email);
        assert.equal(blocked.status, 429, `${state} sixth resend must hit the per-email limit`);
        bodies429.push({ json: blocked.json, retryAfter: blocked.retryAfter });
        if (verified === false) assert.equal(await unusedTokenCount(userId), 1, 'a blocked resend writes nothing');
    }
    for (const body of bodies200) assert.deepEqual(body, GENERIC_RESEND);
    for (const entry of bodies429) {
        assert.deepEqual(entry.json, RATE_LIMITED_BODY);
        assert.ok(Number.isInteger(Number(entry.retryAfter)) && Number(entry.retryAfter) >= 1);
    }
    assert.equal(await resendIpCount(), 15);
});

test('mixed states share the per-IP bucket and trip it together', async () => {
    // 15 counted from the uniform section; five mixed resends fill the
    // shared 20/hour per-IP bucket, and the next one trips it.
    const cycle = ['unknown', 'verified', 'unverified', 'unknown', 'verified'];
    for (const state of cycle) {
        const email = freshEmail(`mixed-${state}`);
        if (state === 'verified') await seedUser(email, true);
        if (state === 'unverified') {
            const userId = await seedUser(email, false);
            await seedToken(userId, randomToken());
        }
        const result = await resend(worker.url, email);
        assert.equal(result.status, 200, `mixed ${state} resend must pass while the per-IP bucket fills`);
    }
    assert.equal(await resendIpCount(), 20);
    const email = freshEmail('mixed-trip');
    const userId = await seedUser(email, false);
    await seedToken(userId, randomToken());
    const tripped = await resend(worker.url, email);
    assert.equal(tripped.status, 429);
    assert.deepEqual(tripped.json, RATE_LIMITED_BODY);
    assert.ok(Number.isInteger(Number(tripped.retryAfter)) && Number(tripped.retryAfter) >= 1);
    assert.equal(await unusedTokenCount(userId), 1, 'the tripped resend writes nothing');
});
