const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { contextFromEnvironment, createTestPool } = require('../helpers/application-database');
const { startBackend } = require('../helpers/backend-instance');

const context = contextFromEnvironment(); // Fail before any connection if run directly.
const PASSWORD = 'synthetic-delete-password';
const EMAIL = 'delete-me@example.invalid';
const OTHER_EMAIL = 'other-reader@example.invalid';

let database;
let worker;
let userId;
let otherId;

async function createUser(email) {
    const result = await database.pool.query(
        `INSERT INTO users(first_name, last_name, email, password_hash, email_verified_at)
         VALUES ('Delete', 'Me', $1, $2, now()) RETURNING id`,
        [email, await bcrypt.hash(PASSWORD, 4)]
    );
    return result.rows[0].id;
}

async function seedUserData(id) {
    await database.pool.query(
        `INSERT INTO notes(user_id, book_id, start_chapter, start_verse, end_chapter, end_verse, content)
         VALUES ($1, 1, 1, 1, 1, 1, 'synthetic note')`,
        [id]
    );
    await database.pool.query(
        `INSERT INTO bookmarks(user_id, book_id, start_chapter, start_verse, end_chapter, end_verse)
         VALUES ($1, 1, 1, 1, 1, 1)`,
        [id]
    );
    await database.pool.query(
        `INSERT INTO highlights(user_id, book_id, chapter, verse, color)
         VALUES ($1, 1, 1, 1, '#FFD54F')`,
        [id]
    );
    await database.pool.query(
        `INSERT INTO user_reading_state(user_id, book_id, chapter_number, translation)
         VALUES ($1, 1, 1, 'KJV')`,
        [id]
    );
    await database.pool.query(
        `INSERT INTO email_verification_tokens(user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '1 hour')`,
        [id, crypto.createHash('sha256').update(`synthetic-verify-token-${id}`).digest()]
    );
    await database.pool.query(
        `INSERT INTO password_reset_tokens(user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '1 hour')`,
        [id, crypto.createHash('sha256').update(`synthetic-reset-token-${id}`).digest()]
    );
}

async function count(table, id) {
    const result = await database.pool.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [id]
    );
    return result.rows[0].n;
}

async function userExists(id) {
    const result = await database.pool.query(
        'SELECT count(*)::int AS n FROM users WHERE id = $1', [id]
    );
    return result.rows[0].n === 1;
}

async function allUserRows(id) {
    return {
        notes: await count('notes', id),
        bookmarks: await count('bookmarks', id),
        highlights: await count('highlights', id),
        readingState: await count('user_reading_state', id),
        verificationTokens: await count('email_verification_tokens', id),
        resetTokens: await count('password_reset_tokens', id),
        sessions: await count('auth_sessions', id),
    };
}

test.before(async () => {
    database = await createTestPool(context);
    userId = await createUser(EMAIL);
    otherId = await createUser(OTHER_EMAIL);
    await seedUserData(userId);
    await seedUserData(otherId);
    worker = await startBackend(context);
});
test.beforeEach(async () => { await database.pool.query('DELETE FROM rate_limit_attempts'); });
test.after(async () => {
    if (worker) await worker.stop();
    if (database) await database.close();
});

async function post(path, cookie, token, body = {}) {
    const response = await fetch(`${worker.url}/api/auth/${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Gnosis-Session': '1',
            ...(cookie ? { Cookie: cookie } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    return {
        status: response.status,
        cookie: response.headers.get('set-cookie')?.split(';')[0],
        data: text && response.status !== 204 ? JSON.parse(text) : null,
    };
}

async function deleteAccount(token, body) {
    const response = await fetch(`${worker.url}/api/auth/account`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
}

async function profile(token) {
    return (await fetch(`${worker.url}/api/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
    })).status;
}

const login = (email) => post('login', null, null, { email, password: PASSWORD });

test('deletion requires an authenticated session', async () => {
    const result = await deleteAccount(null, { password: PASSWORD });
    assert.equal(result.status, 401);
    assert.equal(await userExists(userId), true);
});

test('deletion without a password is a 400 and deletes nothing', async () => {
    const session = await login(EMAIL);
    assert.equal(session.status, 200);
    const result = await deleteAccount(session.data.token, {});
    assert.equal(result.status, 400);
    assert.equal(result.data.code, 'VALIDATION_FAILED');
    assert.deepEqual(await allUserRows(userId), {
        notes: 1, bookmarks: 1, highlights: 1, readingState: 1,
        verificationTokens: 1, resetTokens: 1, sessions: 1,
    });
});

test('a wrong password is a 401 and deletes nothing', async () => {
    const session = await login(EMAIL);
    assert.equal(session.status, 200);
    const result = await deleteAccount(session.data.token, { password: 'wrong-password' });
    assert.equal(result.status, 401);
    assert.deepEqual(result.data, { error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
    assert.equal(await userExists(userId), true);
    assert.deepEqual(await allUserRows(userId), {
        notes: 1, bookmarks: 1, highlights: 1, readingState: 1,
        verificationTokens: 1, resetTokens: 1, sessions: 2,
    });
    assert.equal(await profile(session.data.token), 200);
});

test('the correct password deletes the account, its data, and its sessions', async () => {
    const first = await login(EMAIL);
    const second = await login(EMAIL);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const other = await login(OTHER_EMAIL);
    assert.equal(other.status, 200);

    const result = await deleteAccount(first.data.token, { password: PASSWORD });
    assert.equal(result.status, 200);
    assert.deepEqual(result.data, { deleted: true });

    assert.equal(await userExists(userId), false);
    assert.deepEqual(await allUserRows(userId), {
        notes: 0, bookmarks: 0, highlights: 0, readingState: 0,
        verificationTokens: 0, resetTokens: 0, sessions: 0,
    });
    assert.equal((await database.pool.query(
        'SELECT count(*)::int AS n FROM auth_refresh_tokens'
    )).rows[0].n, 1, 'only the other account\'s refresh token survives');

    // Both of the deleted account's credentials are dead immediately.
    assert.equal(await profile(first.data.token), 403);
    assert.equal(await profile(second.data.token), 403);
    assert.equal((await post('refresh', first.cookie)).status, 401);
    assert.equal((await post('refresh', second.cookie)).status, 401);
    assert.equal((await login(EMAIL)).status, 401);
    assert.equal((await deleteAccount(first.data.token, { password: PASSWORD })).status, 403);

    // The other account is untouched: its data and session still work.
    assert.equal(await userExists(otherId), true);
    assert.deepEqual(await allUserRows(otherId), {
        notes: 1, bookmarks: 1, highlights: 1, readingState: 1,
        verificationTokens: 1, resetTokens: 1, sessions: 1,
    });
    assert.equal(await profile(other.data.token), 200);
});
