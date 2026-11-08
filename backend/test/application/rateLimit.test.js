const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { contextFromEnvironment, createTestPool } = require('../helpers/application-database');
const { startBackend } = require('../helpers/backend-instance');
const { computeKeyHash, RATE_LIMITED_BODY } = require('../../src/utils/rateLimit');

const context = contextFromEnvironment(); // Fail before any connection if run directly.
const RATE_SECRET = 'synthetic-application-test-rate-limit';
const JWT_SECRET = 'synthetic-application-test-jwt';
// Workers run with trust proxy disabled, so every request keys on the
// loopback socket address.
const IP = '127.0.0.1';

let database;
let worker;
test.before(async () => {
    database = await createTestPool(context);
    worker = await startBackend(context);
});
test.after(async () => {
    if (worker) await worker.stop();
    if (database) await database.close();
});

async function post(url, path, body, headers = {}) {
    const response = await fetch(`${url}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    return {
        status: response.status,
        retryAfter: response.headers.get('retry-after'),
        json: text ? JSON.parse(text) : null,
    };
}

async function login(url, email, password, headers) {
    return post(url, '/api/auth/login', { email, password }, headers);
}

async function register(url, email, password) {
    return post(url, '/api/auth/register',
        { firstName: 'Test', lastName: 'User', email, password });
}

async function attemptCount(policy, fields) {
    const hash = computeKeyHash(policy, fields, RATE_SECRET);
    const result = await database.pool.query(
        'SELECT count(*)::int AS n FROM rate_limit_attempts WHERE key_hash = $1 AND policy = $2',
        [hash, policy]);
    return result.rows[0].n;
}

async function seedUser(email, password) {
    const hash = await bcrypt.hash(password, 10);
    // Seeded users stand in for pre-existing accounts, which the #9
    // migration grandfathers as verified; without the stamp the login
    // gate would 403 every seeded login.
    const result = await database.pool.query(
        'INSERT INTO users(email, password_hash, first_name, last_name, email_verified_at) VALUES ($1, $2, $3, $4, now()) RETURNING id',
        [email, hash, 'Test', 'User']);
    return result.rows[0].id;
}

// Tests share one database and one loopback address, so the per-IP bucket
// accumulates across tests. Per-email buckets use a fresh email per test
// (exact counts), while the per-IP test reads its starting count and
// derives how many failures remain before the limit (robust to order).
// The per-IP bucket is filled by the per-IP test; the both-blocked test
// runs right after it and relies on that full bucket.

test('concurrent burst is strict: exactly 5 of 20 attempts pass the email bucket', async () => {
    const email = 'burst@example.com';
    assert.equal(await attemptCount('login_ip_email', [IP, email]), 0);
    const results = await Promise.all(Array.from({ length: 20 }, () =>
        login(worker.url, email, 'wrong-password')));
    const denied = results.filter(result => result.status === 401);
    const blocked = results.filter(result => result.status === 429);
    assert.equal(denied.length, 5, 'exactly the limit passes');
    assert.equal(blocked.length, 15, 'the rest are blocked, none fail closed');
    assert.ok(results.every(result => result.status === 401 || result.status === 429));
    assert.equal(await attemptCount('login_ip_email', [IP, email]), 5);
    assert.equal(await attemptCount('login_ip', [IP]), 5);
});

test('login per-email limit blocks the sixth attempt, even with the right password', async () => {
    const email = 'victim@example.com';
    await seedUser(email, 'correct-password');
    assert.equal(await attemptCount('login_ip_email', [IP, email]), 0);
    for (let i = 0; i < 5; i++) {
        const result = await login(worker.url, email, 'wrong-password');
        assert.equal(result.status, 401);
        assert.deepEqual(result.json, { error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
    }
    // Successes do not bypass a full bucket: prior failures are cleared
    // only by window expiry, never by a later success.
    const blocked = await login(worker.url, email, 'correct-password');
    assert.equal(blocked.status, 429);
    assert.deepEqual(blocked.json, RATE_LIMITED_BODY);
    assert.ok(Number.isInteger(Number(blocked.retryAfter)) && Number(blocked.retryAfter) >= 1);
    assert.equal(await attemptCount('login_ip_email', [IP, email]), 5,
        'the blocked attempt rolled its reservation back');
});

test('forwarded headers are ignored while trust proxy is disabled', async () => {
    const email = 'forwarded@example.com';
    for (let i = 0; i < 5; i++) {
        const result = await login(worker.url, email, 'wrong-password',
            { 'X-Forwarded-For': '203.0.113.7' });
        assert.equal(result.status, 401);
    }
    const blocked = await login(worker.url, email, 'wrong-password',
        { 'X-Forwarded-For': '198.51.100.8' });
    assert.equal(blocked.status, 429,
        'a different forwarded address must not open a fresh bucket');
});

test('rows outside the window do not count', async () => {
    const email = 'window@example.com';
    await database.pool.query(
        `INSERT INTO rate_limit_attempts(key_hash, policy, attempted_at)
         VALUES ($1, 'login_ip_email', now() - INTERVAL '16 minutes')`,
        [computeKeyHash('login_ip_email', [IP, email], RATE_SECRET)]);
    for (let i = 0; i < 5; i++) {
        const result = await login(worker.url, email, 'wrong-password');
        assert.equal(result.status, 401, 'the expired row must not fill the bucket');
    }
    const blocked = await login(worker.url, email, 'wrong-password');
    assert.equal(blocked.status, 429);
    assert.equal(await attemptCount('login_ip_email', [IP, email]), 6,
        'one expired row plus five fresh failures; the blocked attempt rolled back');
});

test('login per-IP limit blocks across accounts once the shared bucket fills', async () => {
    const before = await attemptCount('login_ip', [IP]);
    assert.ok(before < 30, 'earlier tests must not have filled the shared bucket');
    const remaining = 30 - before;
    for (let i = 0; i < remaining; i++) {
        const result = await login(worker.url, `account-${i}@example.com`, 'wrong-password');
        assert.equal(result.status, 401);
    }
    const blocked = await login(worker.url, 'one-more@example.com', 'wrong-password');
    assert.equal(blocked.status, 429);
    assert.deepEqual(blocked.json, RATE_LIMITED_BODY,
        'the 429 body is identical regardless of which policy fired');
    assert.equal(await attemptCount('login_ip', [IP]), 30);
});

test('both login policies blocked returns the longest wait and consumes neither quota', async () => {
    const email = 'both-blocked@example.com';
    // Five failures 14 minutes old: the email bucket is full with only
    // about a minute left. The shared per-IP bucket is already full from
    // the previous test with a much longer wait remaining.
    await database.pool.query(
        `INSERT INTO rate_limit_attempts(key_hash, policy, attempted_at)
         SELECT $1, 'login_ip_email', now() - INTERVAL '14 minutes'
         FROM generate_series(1, 5)`,
        [computeKeyHash('login_ip_email', [IP, email], RATE_SECRET)]);
    assert.equal(await attemptCount('login_ip_email', [IP, email]), 5);
    assert.equal(await attemptCount('login_ip', [IP]), 30);
    const blocked = await login(worker.url, email, 'wrong-password');
    assert.equal(blocked.status, 429);
    assert.deepEqual(blocked.json, RATE_LIMITED_BODY);
    // The wait must be the per-IP policy's long remaining wait, not the
    // email policy's ~60 seconds.
    assert.ok(Number(blocked.retryAfter) > 300,
        'Retry-After must be the longest wait across blocking policies');
    assert.equal(await attemptCount('login_ip_email', [IP, email]), 5,
        'the blocked request consumed no email quota');
    assert.equal(await attemptCount('login_ip', [IP]), 30,
        'the blocked request consumed no per-IP quota');
});

test('registration per-IP limit counts successes and duplicates', async () => {
    assert.equal(await attemptCount('register_ip', [IP]), 0);
    for (let i = 0; i < 4; i++) {
        const result = await register(worker.url, `new-${i}@example.com`, 'a-valid-password');
        assert.equal(result.status, 200);
    }
    const duplicate = await register(worker.url, 'new-0@example.com', 'a-valid-password');
    assert.equal(duplicate.status, 409, 'a duplicate counts just like a success');
    const blocked = await register(worker.url, 'new-4@example.com', 'a-valid-password');
    assert.equal(blocked.status, 429);
    assert.deepEqual(blocked.json, RATE_LIMITED_BODY);
    assert.equal(await attemptCount('register_ip', [IP]), 5);
});

test('in-response sweep deletes expired rows and keeps fresh ones', async () => {
    const sweepWorker = await startBackend(context);
    try {
        const dummy = computeKeyHash('login_ip', [IP], RATE_SECRET);
        // The dummy key is the real shared per-IP bucket key, so earlier
        // login tests already left fresh rows under it. Count before
        // inserting, then assert the sweep removes exactly the expired
        // rows and keeps every fresh one.
        const before = (await database.pool.query(
            'SELECT count(*)::int AS n FROM rate_limit_attempts WHERE key_hash = $1',
            [dummy])).rows[0].n;
        await database.pool.query(
            `INSERT INTO rate_limit_attempts(key_hash, policy, attempted_at)
             VALUES ($1, 'login_ip', now() - INTERVAL '61 minutes'),
                    ($1, 'login_ip', now() - INTERVAL '62 minutes'),
                    ($1, 'login_ip', now() - INTERVAL '63 minutes')`,
            [dummy]);
        await database.pool.query(
            `INSERT INTO rate_limit_attempts(key_hash, policy, attempted_at)
             VALUES ($1, 'login_ip', now())`,
            [dummy]);
        await database.pool.query(
            `UPDATE rate_limit_sweep_state SET last_swept_at = now() - INTERVAL '2 hours' WHERE id = 1`);
        // Any limiter pass triggers the sweep in-response; login buckets
        // are full by now, so this request is blocked but still sweeps.
        const triggered = await login(sweepWorker.url, 'sweep-trigger@example.com', 'wrong-password');
        assert.equal(triggered.status, 429);
        const expired = await database.pool.query(
            `SELECT count(*)::int AS n FROM rate_limit_attempts
             WHERE key_hash = $1 AND attempted_at < now() - INTERVAL '60 minutes'`, [dummy]);
        assert.equal(expired.rows[0].n, 0, 'all expired rows are gone');
        const fresh = await database.pool.query(
            `SELECT count(*)::int AS n FROM rate_limit_attempts
             WHERE key_hash = $1 AND attempted_at >= now() - INTERVAL '60 minutes'`, [dummy]);
        assert.equal(fresh.rows[0].n, before + 1,
            'the fresh test row survives alongside the earlier fresh bucket rows');
        const state = await database.pool.query(
            'SELECT last_swept_at FROM rate_limit_sweep_state WHERE id = 1');
        assert.ok(new Date(state.rows[0].last_swept_at).getTime() > Date.now() - 5 * 60 * 1000,
            'the shared sweep state advanced');
    } finally {
        await sweepWorker.stop();
    }
});

test('two instances sweeping at once do not error or corrupt the sweep', async () => {
    const first = await startBackend(context);
    const second = await startBackend(context);
    try {
        const dummy = computeKeyHash('login_ip', [IP], RATE_SECRET);
        await database.pool.query(
            `INSERT INTO rate_limit_attempts(key_hash, policy, attempted_at)
             VALUES ($1, 'login_ip', now() - INTERVAL '61 minutes')`,
            [dummy]);
        await database.pool.query(
            `UPDATE rate_limit_sweep_state SET last_swept_at = now() - INTERVAL '2 hours' WHERE id = 1`);
        const results = await Promise.all([
            login(first.url, 'race-a@example.com', 'wrong-password'),
            login(second.url, 'race-b@example.com', 'wrong-password'),
        ]);
        assert.ok(results.every(result => result.status === 429),
            'both requests are blocked (buckets are full), neither fails closed');
        const expired = await database.pool.query(
            `SELECT count(*)::int AS n FROM rate_limit_attempts
             WHERE key_hash = $1 AND attempted_at < now() - INTERVAL '60 minutes'`, [dummy]);
        assert.equal(expired.rows[0].n, 0);
    } finally {
        await first.stop();
        await second.stop();
    }
});

test('profile reads stay unthrottled', async () => {
    const id = await seedUser('profile@example.com', 'correct-password');
    const sid = require('node:crypto').randomUUID();
    await database.pool.query("INSERT INTO auth_sessions(id,user_id,expires_at) VALUES ($1,$2,now() + interval '1 hour')", [sid, id]);
    const token = jwt.sign({ userId: id, sid }, JWT_SECRET, { expiresIn: '15m', issuer: 'gnosis', audience: 'gnosis-api' });
    for (let i = 0; i < 10; i++) {
        const response = await fetch(`${worker.url}/api/auth/profile`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10000),
        });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.email, 'profile@example.com');
    }
});
