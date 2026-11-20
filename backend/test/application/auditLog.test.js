const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const bcrypt = require('bcrypt');
const { contextFromEnvironment, createTestPool } = require('../helpers/application-database');
const { startBackend } = require('../helpers/backend-instance');

const context = contextFromEnvironment(); // Fail before any connection if run directly.
const PASSWORD = 'synthetic-audit-password';
const NEW_PASSWORD = 'synthetic-audit-password-2';

// The delivery stub stands in for Resend. Workers receive its loopback
// URL through RESEND_API_BASE_URL, which they honor only because they
// run isolated; production always uses api.resend.com.
const delivered = [];
let database;
let worker;
let stub;
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
            delivered.push({ to: payload.to, html: payload.html, text: payload.text });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ id: 'synthetic-resend-id' }));
        });
    });
    await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
    process.env.RESEND_API_BASE_URL = `http://127.0.0.1:${stub.address().port}`;
    worker = await startBackend(context);
    // The per-IP buckets are shared across application test files, so
    // each section starts from a clean limiter state.
    await database.pool.query('DELETE FROM rate_limit_attempts');
});
test.beforeEach(async () => {
    await database.pool.query('DELETE FROM rate_limit_attempts');
});
test.after(async () => {
    if (worker) await worker.stop();
    if (database) await database.close();
    if (stub) await new Promise(resolve => stub.close(resolve));
    delete process.env.RESEND_API_BASE_URL;
});

async function post(path, body, headers = {}) {
    const response = await fetch(`${worker.url}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    return { status: response.status,
        cookie: response.headers.get('set-cookie')?.split(';')[0] || null,
        json: text ? JSON.parse(text) : null };
}
function freshEmail(tag) {
    emailCounter += 1;
    // Prefixed so addresses never collide with the other application
    // test files, which share this database and use the same tags.
    return `audit-${tag}-${emailCounter}@example.invalid`;
}
async function seedUser(email) {
    const hash = await bcrypt.hash(PASSWORD, 4);
    const result = await database.pool.query(
        'INSERT INTO users(email, password_hash, first_name, last_name, email_verified_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [email, hash, 'Test', 'User', new Date()]);
    return result.rows[0].id;
}
async function eventsFor(userId, kind) {
    const result = await database.pool.query(
        'SELECT id, kind, user_id, created_at FROM security_events WHERE user_id = $1 AND kind = $2 ORDER BY id',
        [userId, kind]);
    return result.rows;
}
async function countEvents(kind, userIdNull) {
    const result = await database.pool.query(
        userIdNull
            ? 'SELECT count(*)::int AS n FROM security_events WHERE kind = $1 AND user_id IS NULL'
            : 'SELECT count(*)::int AS n FROM security_events WHERE kind = $1',
        [kind]);
    return result.rows[0].n;
}
function tokenFrom(email) {
    const items = delivered.filter(item => item.to === email);
    assert.ok(items.length > 0, `expected a delivered email for ${email}`);
    const match = items[items.length - 1].html.match(/#token=([A-Za-z0-9_-]{43})/);
    assert.ok(match, 'delivered email must carry a fragment reset link');
    return match[1];
}
async function profileStatus(token) {
    const response = await fetch(`${worker.url}/api/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
    });
    return response.status;
}

test('security_events stores exactly kind, user_id, and created_at', async () => {
    const result = await database.pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'security_events' ORDER BY ordinal_position`);
    assert.deepEqual(result.rows.map(row => row.column_name), ['id', 'kind', 'user_id', 'created_at']);
});

test('successful and failed logins each write exactly one audit row', async () => {
    const email = freshEmail('login');
    const userId = await seedUser(email);
    const failed = await post('/api/auth/login', { email, password: 'wrong-password' });
    assert.equal(failed.status, 401);
    const failures = await eventsFor(userId, 'login.failure');
    assert.equal(failures.length, 1);
    assert.equal(failures[0].user_id, userId);
    assert.ok(Date.now() - new Date(failures[0].created_at).getTime() < 60000);
    const ok = await post('/api/auth/login', { email, password: PASSWORD });
    assert.equal(ok.status, 200);
    assert.ok(ok.json.token);
    const successes = await eventsFor(userId, 'login.success');
    assert.equal(successes.length, 1);
    assert.equal(successes[0].user_id, userId);
    assert.ok(Date.now() - new Date(successes[0].created_at).getTime() < 60000);
    // The failure did not also write a success row, and vice versa.
    assert.equal((await eventsFor(userId, 'login.failure')).length, 1);
});

test('unknown-email login failure records a null user, never the address', async () => {
    const before = await countEvents('login.failure', true);
    const failed = await post('/api/auth/login', { email: freshEmail('unknown'), password: PASSWORD });
    assert.equal(failed.status, 401);
    assert.equal(await countEvents('login.failure', true), before + 1);
});

test('password reset completion writes password_reset.completed', async () => {
    const email = freshEmail('reset');
    const userId = await seedUser(email);
    const requested = await post('/api/auth/forgot-password', { email });
    assert.equal(requested.status, 200);
    const done = await post('/api/auth/reset-password', { token: tokenFrom(email), password: NEW_PASSWORD });
    assert.equal(done.status, 200);
    assert.deepEqual(done.json, { reset: true });
    const rows = await eventsFor(userId, 'password_reset.completed');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, userId);
    // The new password works, so the reset really completed.
    assert.equal((await post('/api/auth/login', { email, password: NEW_PASSWORD })).status, 200);
});

test('refresh-token replay writes refresh_token.reused and revokes the family', async () => {
    const email = freshEmail('reuse');
    const userId = await seedUser(email);
    const first = await post('/api/auth/login', { email, password: PASSWORD });
    assert.equal(first.status, 200);
    const next = await post('/api/auth/refresh', {}, { Cookie: first.cookie, 'X-Gnosis-Session': '1' });
    assert.equal(next.status, 200);
    assert.notEqual(next.cookie, first.cookie);
    const replay = await post('/api/auth/refresh', {}, { Cookie: first.cookie, 'X-Gnosis-Session': '1' });
    assert.equal(replay.status, 401);
    const rows = await eventsFor(userId, 'refresh_token.reused');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, userId);
    // The replay revoked the whole family: the rotated token is dead too.
    assert.equal(await profileStatus(next.json.token), 403);
});

test('logout-all writes logout.all', async () => {
    const email = freshEmail('logout-all');
    const userId = await seedUser(email);
    const first = await post('/api/auth/login', { email, password: PASSWORD });
    const second = await post('/api/auth/login', { email, password: PASSWORD });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const done = await post('/api/auth/logout-all', {}, { Authorization: `Bearer ${second.json.token}` });
    assert.equal(done.status, 204);
    const rows = await eventsFor(userId, 'logout.all');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, userId);
    assert.equal(await profileStatus(first.json.token), 403);
    assert.equal(await profileStatus(second.json.token), 403);
});
