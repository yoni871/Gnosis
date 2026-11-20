const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const bcrypt = require('bcrypt');
const { contextFromEnvironment, createTestPool } = require('../helpers/application-database');
const { startBackend } = require('../helpers/backend-instance');

const context = contextFromEnvironment(); // Fail before any connection if run directly.
const PASSWORD = 'synthetic-notify-password';

// The delivery stub stands in for Resend. The worker receives its
// loopback URL through RESEND_API_BASE_URL, which it honors only
// because it runs isolated; production always uses api.resend.com.
let stubMode = 'ok'; // 'ok' | 'fail'
const delivered = [];
let database;
let worker;
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
            delivered.push({ to: payload.to, subject: payload.subject, html: payload.html, text: payload.text });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ id: 'synthetic-resend-id' }));
        });
    });
    await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
    stubUrl = `http://127.0.0.1:${stub.address().port}`;
    process.env.RESEND_API_BASE_URL = stubUrl;
    worker = await startBackend(context);
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
    return { status: response.status, json: text ? JSON.parse(text) : null };
}
function freshEmail(tag) {
    emailCounter += 1;
    // Prefixed so addresses never collide with the other application
    // test files, which share this database and use the same tags.
    return `notify-${tag}-${emailCounter}@example.invalid`;
}
async function seedUser(email) {
    const hash = await bcrypt.hash(PASSWORD, 4);
    const result = await database.pool.query(
        'INSERT INTO users(email, password_hash, first_name, last_name, email_verified_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [email, hash, 'Test', 'User', new Date()]);
    return result.rows[0].id;
}
function deliveredTo(email) {
    return delivered.filter((message) => message.to === email);
}

test('a synthetic new-device login delivers the new-device email, and only once', async () => {
    const email = freshEmail('first');
    await seedUser(email);
    const first = await post('/api/auth/login', { email, password: PASSWORD }, { 'User-Agent': 'NotifyTest/1.0' });
    assert.equal(first.status, 200);
    const messages = deliveredTo(email);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].subject, 'New sign-in to your Gnosis account');
    assert.match(messages[0].text, /A new device signed in to your Gnosis account at /);
    assert.match(messages[0].text, /If this was you, you don't need to do anything\./);
    assert.ok(messages[0].text.includes('https://frontend.example.invalid/forgot-password'));
    assert.ok(messages[0].html.includes('https://frontend.example.invalid/forgot-password'));
    // Content policy: no raw IP, no user-agent, no token, no password.
    const combined = `${messages[0].subject}\n${messages[0].html}\n${messages[0].text}`;
    assert.ok(!combined.includes('127.0.0.1'));
    assert.ok(!combined.includes('NotifyTest'));
    assert.ok(!/token|password_hash/i.test(combined));
});

test('a login from a known device delivers no further email', async () => {
    const email = freshEmail('known');
    await seedUser(email);
    const first = await post('/api/auth/login', { email, password: PASSWORD }, { 'User-Agent': 'NotifyTest/1.0' });
    assert.equal(first.status, 200);
    assert.equal(deliveredTo(email).length, 1);
    const second = await post('/api/auth/login', { email, password: PASSWORD }, { 'User-Agent': 'NotifyTest/1.0' });
    assert.equal(second.status, 200);
    assert.equal(deliveredTo(email).length, 1, 'a known device must not re-notify');
});

test('a login from a second new device delivers a second email', async () => {
    const email = freshEmail('second');
    await seedUser(email);
    const first = await post('/api/auth/login', { email, password: PASSWORD }, { 'User-Agent': 'NotifyTest/1.0' });
    assert.equal(first.status, 200);
    const second = await post('/api/auth/login', { email, password: PASSWORD }, { 'User-Agent': 'NotifyTest/2.0' });
    assert.equal(second.status, 200);
    assert.equal(deliveredTo(email).length, 2);
});

test('a provider failure keeps the login at 200 and delivers nothing', async () => {
    const email = freshEmail('fail');
    await seedUser(email);
    stubMode = 'fail';
    try {
        const first = await post('/api/auth/login', { email, password: PASSWORD }, { 'User-Agent': 'NotifyTest/1.0' });
        assert.equal(first.status, 200, 'a failed notification must never break login');
        assert.equal(deliveredTo(email).length, 0);
    } finally {
        stubMode = 'ok';
    }
    // The device was still recorded, so a later login from the same
    // device is known — and still delivers nothing new.
    const second = await post('/api/auth/login', { email, password: PASSWORD }, { 'User-Agent': 'NotifyTest/1.0' });
    assert.equal(second.status, 200);
    assert.equal(deliveredTo(email).length, 0);
});
