const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { contextFromEnvironment, createTestPool } = require('../helpers/application-database');
const { startBackend } = require('../helpers/backend-instance');
const { hashPasswordResetToken } = require('../../src/utils/passwordReset');
const { RATE_LIMITED_BODY } = require('../../src/utils/rateLimit');

const context = contextFromEnvironment(); // Fail before any connection if run directly.
const IP = '127.0.0.1';
const GENERIC_FORGOT = { message: 'If there is an account for this email, a password reset link has been sent.' };
const GENERIC_RESET = { error: 'Invalid or expired password reset link.', code: 'INVALID_RESET_LINK' };
const PASSWORD = 'synthetic-password-1';
const NEW_PASSWORD = 'synthetic-password-2';

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
function freshEmail(tag) {
    emailCounter += 1;
    // Prefixed so addresses never collide with the other application
    // test files, which share this database and use the same tags.
    return `reset-${tag}-${emailCounter}@example.invalid`;
}
async function login(url, email, password = PASSWORD) {
    return post(url, '/api/auth/login', { email, password });
}
async function forgot(url, email) {
    return post(url, '/api/auth/forgot-password', { email });
}
async function reset(url, token, password = NEW_PASSWORD) {
    return post(url, '/api/auth/reset-password', { token, password });
}
function deliveredTo(email) {
    return delivered.filter(item => item.to === email);
}
function tokenFrom(email) {
    const items = deliveredTo(email);
    assert.ok(items.length > 0, `expected a delivered email for ${email}`);
    const match = items[items.length - 1].html.match(/#token=([A-Za-z0-9_-]{43})/);
    assert.ok(match, 'delivered email must carry a fragment reset link');
    return match[1];
}
async function userByEmail(email) {
    const result = await database.pool.query('SELECT * FROM users WHERE email=$1', [email]);
    return result.rows[0];
}
async function tokensFor(userId) {
    const result = await database.pool.query(
        'SELECT * FROM password_reset_tokens WHERE user_id=$1 ORDER BY id', [userId]);
    return result.rows;
}
async function unusedTokenCount(userId) {
    const result = await database.pool.query(
        "SELECT count(*)::int AS n FROM password_reset_tokens WHERE user_id=$1 AND consumed_reason IS NULL AND expires_at > now()",
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
async function seedToken(userId, token, expiresAtSql = "now() + interval '1 hour'") {
    const result = await database.pool.query(
        `INSERT INTO password_reset_tokens(user_id, token_hash, expires_at) VALUES ($1, $2, ${expiresAtSql}) RETURNING id`,
        [userId, hashPasswordResetToken(token)]);
    return result.rows[0].id;
}
function randomToken() {
    return crypto.randomBytes(32).toString('base64url');
}
async function forgotIpCount() {
    const result = await database.pool.query(
        "SELECT count(*)::int AS n FROM rate_limit_attempts WHERE policy='forgot_ip'");
    return result.rows[0].n;
}
async function resetIpCount() {
    const result = await database.pool.query(
        "SELECT count(*)::int AS n FROM rate_limit_attempts WHERE policy='reset_ip'");
    return result.rows[0].n;
}
async function resetRateLimits() {
    // Section isolation only: the per-IP buckets are shared across this
    // file, so each section resets them before asserting its own counts.
    await database.pool.query('DELETE FROM rate_limit_attempts');
}

test('full flow: forgot, reset, login with the new password, old password fails', async () => {
    const email = freshEmail('full-flow');
    const userId = await seedUser(email, true);
    const requested = await forgot(worker.url, email);
    assert.equal(requested.status, 200);
    assert.deepEqual(requested.json, GENERIC_FORGOT);
    assert.equal(deliveredTo(email).length, 1);
    const token = tokenFrom(email);
    const rows = await tokensFor(userId);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].token_hash, hashPasswordResetToken(token));
    assert.ok(!rows[0].token_hash.toString('hex').includes(token), 'no raw token in the stored row');
    const ttlMs = new Date(rows[0].expires_at) - new Date(rows[0].created_at);
    assert.ok(Math.abs(ttlMs - 60 * 60 * 1000) < 60 * 1000, `TTL must be 1h, got ${ttlMs}ms`);
    const done = await reset(worker.url, token);
    assert.equal(done.status, 200);
    assert.deepEqual(done.json, { reset: true });
    const after = await tokensFor(userId);
    assert.equal(after[0].consumed_reason, 'used');
    assert.ok(after[0].used_at);
    const loggedIn = await login(worker.url, email, NEW_PASSWORD);
    assert.equal(loggedIn.status, 200);
    assert.ok(loggedIn.json.token);
    const oldPassword = await login(worker.url, email, PASSWORD);
    assert.equal(oldPassword.status, 401);
    assert.deepEqual(oldPassword.json, { error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
    const replay = await reset(worker.url, token);
    assert.equal(replay.status, 400);
    assert.deepEqual(replay.json, GENERIC_RESET);
    assert.equal((await tokensFor(userId)).length, 1);
});

test('superseded token is generically invalid and the newest link works', async () => {
    const email = freshEmail('superseded');
    const userId = await seedUser(email, true);
    const oldToken = randomToken();
    await seedToken(userId, oldToken);
    const requested = await forgot(worker.url, email);
    assert.equal(requested.status, 200);
    assert.deepEqual(requested.json, GENERIC_FORGOT);
    const newToken = tokenFrom(email);
    assert.notEqual(newToken, oldToken);
    const stale = await reset(worker.url, oldToken);
    assert.equal(stale.status, 400);
    assert.deepEqual(stale.json, GENERIC_RESET);
    const fresh = await reset(worker.url, newToken);
    assert.equal(fresh.status, 200);
    const rows = await tokensFor(userId);
    assert.equal(rows.find(row => row.token_hash.equals(hashPasswordResetToken(oldToken))).consumed_reason, 'superseded');
    assert.equal(rows.find(row => row.token_hash.equals(hashPasswordResetToken(newToken))).consumed_reason, 'used');
    assert.equal(await login(worker.url, email, NEW_PASSWORD).then(result => result.status), 200);
});

test('a successful reset supersedes other outstanding tokens', async () => {
    const email = freshEmail('supersede-others');
    const userId = await seedUser(email, true);
    const otherToken = randomToken();
    await seedToken(userId, otherToken);
    await forgot(worker.url, email);
    const token = tokenFrom(email);
    assert.notEqual(token, otherToken);
    assert.equal((await reset(worker.url, token)).status, 200);
    const rows = await tokensFor(userId);
    assert.equal(rows.find(row => row.token_hash.equals(hashPasswordResetToken(otherToken))).consumed_reason, 'superseded');
    assert.equal((await reset(worker.url, otherToken)).status, 400);
});

test('expired and unknown tokens share the same generic 400', async () => {
    const email = freshEmail('expired');
    const userId = await seedUser(email, true);
    const expiredToken = randomToken();
    await seedToken(userId, expiredToken, "now() - interval '1 hour'");
    const expired = await reset(worker.url, expiredToken);
    assert.equal(expired.status, 400);
    assert.deepEqual(expired.json, GENERIC_RESET);
    const unknown = await reset(worker.url, randomToken());
    assert.equal(unknown.status, 400);
    assert.deepEqual(unknown.json, GENERIC_RESET);
});

test('invalid forgot and reset inputs consume no quota', async () => {
    const forgotBefore = await forgotIpCount();
    const resetBefore = await resetIpCount();
    for (const email of ['not-an-email', '', 'missing-at.example']) {
        const result = await forgot(worker.url, email);
        assert.equal(result.status, 400);
    }
    for (const token of ['x', '', 'a'.repeat(42), 'has space in it']) {
        const result = await reset(worker.url, token);
        assert.equal(result.status, 400);
    }
    const short = await reset(worker.url, randomToken(), 'short');
    assert.equal(short.status, 400);
    assert.equal(await forgotIpCount(), forgotBefore);
    assert.equal(await resetIpCount(), resetBefore);
    // A valid reset still works after the invalid batch.
    const email = freshEmail('invalid-then-valid');
    const userId = await seedUser(email, true);
    const token = randomToken();
    await seedToken(userId, token);
    assert.equal((await reset(worker.url, token)).status, 200);
});

test('provider failure preserves the token and a later forgot succeeds', async () => {
    stubMode = 'fail';
    try {
        const email = freshEmail('provider-down');
        const userId = await seedUser(email, true);
        const requested = await forgot(worker.url, email);
        assert.equal(requested.status, 200);
        assert.deepEqual(requested.json, GENERIC_FORGOT);
        assert.equal(deliveredTo(email).length, 0);
        assert.equal(await unusedTokenCount(userId), 1, 'the issued token survives the send failure');
        stubMode = 'ok';
        const again = await forgot(worker.url, email);
        assert.equal(again.status, 200);
        assert.equal(deliveredTo(email).length, 1);
        assert.equal((await reset(worker.url, tokenFrom(email))).status, 200);
    } finally {
        stubMode = 'ok';
    }
});

test('provider timeout preserves the token', async () => {
    stubMode = 'slow';
    try {
        const email = freshEmail('provider-timeout');
        const userId = await seedUser(email, true);
        const started = Date.now();
        const requested = await forgot(worker.url, email);
        const elapsed = Date.now() - started;
        assert.equal(requested.status, 200);
        assert.ok(elapsed >= 5000 && elapsed < 15000, `forgot must wait out the 5s send timeout, took ${elapsed}ms`);
        assert.equal(deliveredTo(email).length, 0);
        assert.equal(await unusedTokenCount(userId), 1);
    } finally {
        stubMode = 'ok';
    }
    const email = freshEmail('provider-timeout-retry');
    const userId = await seedUser(email, true);
    assert.equal((await forgot(worker.url, email)).status, 200);
    assert.equal(deliveredTo(email).length, 1);
});

async function raceRound(round) {
    // reset-vs-reset: both workers, same token; exactly one succeeds.
    {
        const email = freshEmail(`race-rr-${round}`);
        const userId = await seedUser(email, true);
        const token = randomToken();
        await seedToken(userId, token);
        const [a, b] = await Promise.all([reset(worker.url, token), reset(workerB.url, token)]);
        const statuses = [a.status, b.status].sort();
        assert.deepEqual(statuses, [200, 400], 'exactly one reset must win');
        const winner = a.status === 200 ? a : b;
        assert.deepEqual(winner.json, { reset: true });
        const loser = a.status === 400 ? a : b;
        assert.deepEqual(loser.json, GENERIC_RESET);
        assert.equal((await tokensFor(userId))[0].consumed_reason, 'used');
        assert.equal((await login(worker.url, email, NEW_PASSWORD)).status, 200);
    }
    // forgot-vs-forgot: both generic 200, exactly one valid token left.
    {
        const email = freshEmail(`race-ff-${round}`);
        const userId = await seedUser(email, true);
        const [a, b] = await Promise.all([forgot(worker.url, email), forgot(workerB.url, email)]);
        assert.equal(a.status, 200);
        assert.equal(b.status, 200);
        assert.deepEqual(a.json, GENERIC_FORGOT);
        assert.deepEqual(b.json, GENERIC_FORGOT);
        assert.equal(await unusedTokenCount(userId), 1);
        // Both sends completed (each handler awaits its send), so both
        // emails arrive even though only the newest link works.
        assert.equal(deliveredTo(email).length, 2);
    }
    // reset-vs-forgot: exactly one final state for the seeded token,
    // never a 500; the forgot always leaves one fresh token behind.
    {
        const email = freshEmail(`race-rf-${round}`);
        const userId = await seedUser(email, true);
        const token = randomToken();
        await seedToken(userId, token);
        const [resetResult, forgotResult] = await Promise.all([
            reset(worker.url, token), forgot(workerB.url, email)]);
        assert.notEqual(resetResult.status, 500);
        assert.equal(forgotResult.status, 200);
        assert.deepEqual(forgotResult.json, GENERIC_FORGOT);
        const rows = await tokensFor(userId);
        if (resetResult.status === 200) {
            assert.equal(rows.find(row => row.token_hash.equals(hashPasswordResetToken(token))).consumed_reason, 'used');
            assert.equal((await login(worker.url, email, NEW_PASSWORD)).status, 200);
        } else {
            assert.equal(resetResult.status, 400, 'forgot won: reset sees a superseded token');
            assert.deepEqual(resetResult.json, GENERIC_RESET);
            assert.equal(rows.find(row => row.token_hash.equals(hashPasswordResetToken(token))).consumed_reason, 'superseded');
            assert.equal((await login(worker.url, email, PASSWORD)).status, 200);
        }
        assert.equal(await unusedTokenCount(userId), 1, 'the forgot leaves exactly one fresh token');
    }
}

test('multi-worker races keep exactly one final state, with no deadlocks', async () => {
    for (let round = 1; round <= 3; round += 1) await raceRound(round);
});

test('uniform forgot: unknown, unverified, and verified share one generic response and one per-email limit', async () => {
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
            const result = await forgot(worker.url, email);
            assert.equal(result.status, 200, `${state} forgot ${i + 1} must pass`);
            bodies200.push(result.json);
        }
        const blocked = await forgot(worker.url, email);
        assert.equal(blocked.status, 429, `${state} sixth forgot must hit the per-email limit`);
        bodies429.push({ json: blocked.json, retryAfter: blocked.retryAfter });
        if (verified === false) assert.equal(await unusedTokenCount(userId), 1, 'a blocked forgot writes nothing');
        if (verified === true) assert.equal(deliveredTo(email).length, 5, 'each passing forgot sends');
        if (verified === null) assert.equal(deliveredTo(email).length, 0, 'unknown addresses never receive email');
    }
    for (const body of bodies200) assert.deepEqual(body, GENERIC_FORGOT);
    for (const entry of bodies429) {
        assert.deepEqual(entry.json, RATE_LIMITED_BODY);
        assert.ok(Number.isInteger(Number(entry.retryAfter)) && Number(entry.retryAfter) >= 1);
    }
    assert.equal(await forgotIpCount(), 15);
});

test('mixed states share the per-IP bucket and trip it together', async () => {
    // 15 counted from the uniform section; five mixed forgots fill the
    // shared 20/hour per-IP bucket, and the next one trips it.
    const cycle = ['unknown', 'verified', 'unverified', 'unknown', 'verified'];
    for (const state of cycle) {
        const email = freshEmail(`mixed-${state}`);
        if (state === 'verified') await seedUser(email, true);
        if (state === 'unverified') {
            const userId = await seedUser(email, false);
            await seedToken(userId, randomToken());
        }
        const result = await forgot(worker.url, email);
        assert.equal(result.status, 200, `mixed ${state} forgot must pass while the per-IP bucket fills`);
    }
    assert.equal(await forgotIpCount(), 20);
    const email = freshEmail('mixed-trip');
    const userId = await seedUser(email, false);
    await seedToken(userId, randomToken());
    const tripped = await forgot(worker.url, email);
    assert.equal(tripped.status, 429);
    assert.deepEqual(tripped.json, RATE_LIMITED_BODY);
    assert.ok(Number.isInteger(Number(tripped.retryAfter)) && Number(tripped.retryAfter) >= 1);
    assert.equal(await unusedTokenCount(userId), 1, 'the tripped forgot writes nothing');
});
