const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { contextFromEnvironment, createTestPool } = require('../helpers/application-database');
const { startBackend } = require('../helpers/backend-instance');
const { findRecentReuseAlerts, findRecentNewDeviceAlerts } = require('../../src/utils/securityAlerts');

const context = contextFromEnvironment(); // Fail before any connection if run directly.
const PASSWORD = 'synthetic-alerts-password';

let database;
let worker;
let emailCounter = 0;

test.before(async () => {
    database = await createTestPool(context);
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
    return `alerts-${tag}-${emailCounter}@example.invalid`;
}
async function seedUser(email) {
    const hash = await bcrypt.hash(PASSWORD, 4);
    const result = await database.pool.query(
        'INSERT INTO users(email, password_hash, first_name, last_name, email_verified_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [email, hash, 'Test', 'User', new Date()]);
    return result.rows[0].id;
}
async function newDeviceEvents(userId) {
    const result = await database.pool.query(
        'SELECT id, kind, user_id, created_at FROM security_events WHERE user_id = $1 AND kind = $2 ORDER BY id',
        [userId, 'login.new_device']);
    return result.rows;
}
async function deviceRows(userId) {
    const result = await database.pool.query(
        'SELECT user_id, device_key, first_seen_at, last_seen_at FROM known_login_devices WHERE user_id = $1 ORDER BY id',
        [userId]);
    return result.rows;
}
function runAlertScript(args) {
    // The script takes its read connection from the same variable the
    // application pool uses for the App database; here it points at
    // the disposable test database under the generated app role.
    const url = new URL('postgresql://127.0.0.1');
    url.port = String(context.port);
    url.username = context.user;
    url.password = context.password;
    url.pathname = `/${context.database}`;
    return spawnSync(process.execPath, ['scripts/security-alerts.js', ...args], {
        cwd: path.resolve(__dirname, '../..'),
        env: { ...process.env, GNOSIS_APP_DATABASE_URL: url.href },
        encoding: 'utf8', timeout: 30000,
    });
}

test('known_login_devices stores HMAC keys only, never raw IP or user-agent', async () => {
    const result = await database.pool.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'known_login_devices' ORDER BY ordinal_position`);
    assert.deepEqual(result.rows.map(row => row.column_name),
        ['id', 'user_id', 'device_key', 'first_seen_at', 'last_seen_at']);
    assert.equal(result.rows.find(row => row.column_name === 'device_key').data_type, 'bytea');
    // No column can hold a raw IP, user-agent, email, or token.
    assert.ok(!result.rows.some(row => /ip|agent|email|token|password/i.test(row.column_name)));
});

test('first login from a device records it and emits login.new_device once', async () => {
    const email = freshEmail('first');
    const userId = await seedUser(email);
    const first = await post('/api/auth/login', { email, password: PASSWORD }, { 'User-Agent': 'AlertsTest/1.0' });
    assert.equal(first.status, 200);
    assert.equal((await newDeviceEvents(userId)).length, 1);
    const devices = await deviceRows(userId);
    assert.equal(devices.length, 1);
    // The stored key is a 32-byte HMAC, not the IP or the user-agent.
    assert.equal(devices[0].device_key.length, 32);
    assert.ok(!devices[0].device_key.toString('utf8').includes('127.0.0.1'));
    assert.ok(!devices[0].device_key.toString('utf8').includes('AlertsTest'));
});

test('login from a known device/IP does NOT emit login.new_device', async () => {
    const email = freshEmail('known');
    const userId = await seedUser(email);
    const first = await post('/api/auth/login', { email, password: PASSWORD }, { 'User-Agent': 'AlertsTest/1.0' });
    assert.equal(first.status, 200);
    const second = await post('/api/auth/login', { email, password: PASSWORD }, { 'User-Agent': 'AlertsTest/1.0' });
    assert.equal(second.status, 200);
    assert.equal((await newDeviceEvents(userId)).length, 1);
    assert.equal((await deviceRows(userId)).length, 1);
});

test('login from a new device/IP does emit login.new_device', async () => {
    const email = freshEmail('new');
    const userId = await seedUser(email);
    const first = await post('/api/auth/login', { email, password: PASSWORD }, { 'User-Agent': 'AlertsTest/1.0' });
    assert.equal(first.status, 200);
    const second = await post('/api/auth/login', { email, password: PASSWORD }, { 'User-Agent': 'AlertsTest/2.0' });
    assert.equal(second.status, 200);
    assert.equal((await newDeviceEvents(userId)).length, 2);
    assert.equal((await deviceRows(userId)).length, 2);
    // The alert query surfaces both new-device events for this user.
    const alerts = await findRecentNewDeviceAlerts(database.pool, { since: new Date(Date.now() - 3600000) });
    assert.ok(alerts.some(row => row.user_id === userId));
});

test('synthetic refresh-token replay triggers the alert query and the operator script', async () => {
    const email = freshEmail('reuse');
    const userId = await seedUser(email);
    const first = await post('/api/auth/login', { email, password: PASSWORD }, { 'User-Agent': 'AlertsTest/1.0' });
    assert.equal(first.status, 200);
    const next = await post('/api/auth/refresh', {}, { Cookie: first.cookie, 'X-Gnosis-Session': '1' });
    assert.equal(next.status, 200);
    const replay = await post('/api/auth/refresh', {}, { Cookie: first.cookie, 'X-Gnosis-Session': '1' });
    assert.equal(replay.status, 401);
    // The alert query returns the replay.
    const alerts = await findRecentReuseAlerts(database.pool, { since: new Date(Date.now() - 3600000) });
    assert.ok(alerts.some(row => row.user_id === userId));
    // The operator script exits non-zero while the reuse is in window,
    // and its JSON report names the affected user.
    const flagged = runAlertScript(['--json']);
    assert.equal(flagged.status, 1, flagged.stderr);
    const report = JSON.parse(flagged.stdout);
    assert.ok(report.reuse.some(row => row.user_id === userId));
    assert.ok(report.newDevices.some(row => row.user_id === userId));
    // A window after the events finds nothing and exits zero.
    const clean = runAlertScript(['--json', '--since', new Date(Date.now() + 3600000).toISOString()]);
    assert.equal(clean.status, 0, clean.stderr);
    assert.deepEqual(JSON.parse(clean.stdout).reuse, []);
});

test('the operator script refuses to run without a connection', async () => {
    const result = spawnSync(process.execPath, ['scripts/security-alerts.js'], {
        cwd: path.resolve(__dirname, '../..'),
        env: { ...process.env, GNOSIS_APP_DATABASE_URL: '' },
        encoding: 'utf8', timeout: 30000,
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /GNOSIS_APP_DATABASE_URL is required/);
});
