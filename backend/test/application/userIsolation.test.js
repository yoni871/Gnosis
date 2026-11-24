const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { contextFromEnvironment, createTestPool } = require('../helpers/application-database');
const { startBackend, workerEnvironment } = require('../helpers/backend-instance');
const { withUser } = require('../../src/db/userContext');

const context = contextFromEnvironment();
let database, worker, bookId, victim, attacker;

async function account(name) {
    const password = `synthetic-${name}-password`;
    const row = (await database.pool.query(
        'INSERT INTO users(email, first_name, password_hash) VALUES ($1, $2, $3) RETURNING id',
        [`isolation-${name}-${crypto.randomUUID()}@fixture.invalid`, name, await bcrypt.hash(password, 4)])).rows[0];
    const sid = crypto.randomUUID();
    await database.pool.query("INSERT INTO auth_sessions(id,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')", [sid, row.id]);
    return { ...row, password, sid, token: jwt.sign({ userId: row.id, sid }, workerEnvironment().JWT_SECRET,
        { algorithm: 'HS256', issuer: 'gnosis', audience: 'gnosis-api', expiresIn: '1h' }) };
}

async function request(path, method = 'GET', body, token = attacker?.token) {
    const response = await fetch(`${worker.url}/api/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
    });
    const raw = await response.text();
    return { status: response.status, data: raw ? JSON.parse(raw) : null, raw, response };
}

async function owned(table, id, user = victim) {
    return (await withUser(database.pool, user.id, client => client.query(
        `SELECT * FROM ${table} WHERE ${table === 'user_reading_state' ? 'user_id' : 'id'}=$1`, [id]))).rows[0];
}

test.before(async () => {
    database = await createTestPool(context);
    worker = await startBackend(context);
    bookId = (await database.pool.query('SELECT id FROM bible_books ORDER BY id LIMIT 1')).rows[0].id;
    victim = await account('victim');
    attacker = await account('attacker');
});
test.after(async () => { if (worker) await worker.stop(); if (database) await database.close(); });

test('every private route rejects missing and invalid authentication before exposing data', async () => {
    const cases = [
        ['auth/profile', 'GET'], ['auth/logout-all', 'POST'], ['auth/account', 'DELETE', { password: 'wrong' }],
        ['auth/mfa/status', 'GET'], ['auth/mfa/enroll', 'POST', {}],
        ['auth/mfa/enroll/confirm', 'POST', {}], ['auth/mfa/recovery-codes/regenerate', 'POST', {}],
        ['auth/mfa/disable', 'POST', {}],
        ['auth/passkeys', 'GET'], ['auth/passkeys/1', 'PATCH', {}], ['auth/passkeys/1', 'DELETE', {}],
        ['auth/passkeys/register/options', 'POST', {}], ['auth/passkeys/register/verify', 'POST', {}],
        ['notes', 'GET'], ['notes', 'POST', {}], ['notes/1', 'GET'], ['notes/1', 'PATCH', {}], ['notes/1', 'DELETE'],
        ['bookmarks', 'GET'], ['bookmarks', 'POST', {}], ['bookmarks/1', 'GET'], ['bookmarks/1', 'PUT', {}], ['bookmarks/1', 'DELETE'],
        ['highlights', 'GET'], ['highlights', 'POST', {}], ['highlights/1', 'DELETE'], ['highlights/passage', 'DELETE', {}],
        ['reading-state', 'GET'], ['reading-state', 'PUT', {}],
    ];
    for (const [path, method, body] of cases) {
        const absent = await request(path, method, body, null);
        assert.equal(absent.status, 401, `${method} ${path} missing token`);
        const forged = await request(path, method, body, 'forged');
        assert.equal(forged.status, 403, `${method} ${path} invalid token`);
        assert.equal(absent.response.headers.get('cache-control'), 'private, no-store');
    }
});

test('a valid token with another account session cannot authorize private routes', async () => {
    const mismatched = jwt.sign({ userId: victim.id, sid: attacker.sid }, workerEnvironment().JWT_SECRET,
        { algorithm: 'HS256', issuer: 'gnosis', audience: 'gnosis-api', expiresIn: '1h' });
    for (const path of ['auth/profile', 'notes', 'bookmarks', 'highlights', 'reading-state']) {
        assert.equal((await request(path, 'GET', undefined, mismatched)).status, 403, path);
    }
});

test('record IDs and forged owner fields cannot read, change, or delete another account data', async () => {
    const ids = await withUser(database.pool, victim.id, async client => {
        const note = (await client.query(`INSERT INTO notes(user_id,book_id,start_chapter,start_verse,end_chapter,end_verse,content)
            VALUES ($1,$2,1,1,1,1,'victim-secret-note') RETURNING id`, [victim.id, bookId])).rows[0].id;
        const bookmark = (await client.query(`INSERT INTO bookmarks(user_id,book_id,start_chapter,start_verse,end_chapter,end_verse)
            VALUES ($1,$2,1,1,1,1) RETURNING id`, [victim.id, bookId])).rows[0].id;
        const highlight = (await client.query(`INSERT INTO highlights(user_id,book_id,chapter,verse,color)
            VALUES ($1,$2,1,1,'#FFD54F') RETURNING id`, [victim.id, bookId])).rows[0].id;
        await client.query(`INSERT INTO user_reading_state(user_id,book_id,chapter_number,translation)
            VALUES ($1,$2,1,'KJV')`, [victim.id, bookId]);
        return { note, bookmark, highlight };
    });
    const bookmarkBody = { bookId, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 1 };
    for (const [path, method, body] of [
        [`notes/${ids.note}`, 'GET'], [`notes/${ids.note}`, 'PATCH', { content: 'stolen', user_id: attacker.id }],
        [`notes/${ids.note}`, 'DELETE'], [`bookmarks/${ids.bookmark}`, 'GET'],
        [`bookmarks/${ids.bookmark}`, 'PUT', { ...bookmarkBody, user_id: attacker.id }],
        [`bookmarks/${ids.bookmark}`, 'DELETE'], [`highlights/${ids.highlight}`, 'DELETE'],
    ]) {
        const result = await request(path, method, body);
        assert.equal(result.status, 404, `${method} ${path}`);
        assert.ok(!result.raw.includes('victim-secret-note'), `${method} ${path} leaked content`);
    }
    const passage = await request('highlights/passage', 'DELETE',
        { bookId, verses: [{ chapter: 1, verse: 1 }], userId: victim.id });
    assert.equal(passage.status, 200);
    assert.deepEqual(passage.data.removedIds, []);
    for (const [path, marker] of [['notes', 'victim-secret-note'], ['bookmarks', String(ids.bookmark)], ['highlights', String(ids.highlight)]]) {
        const result = await request(path);
        assert.equal(result.status, 200, path);
        assert.ok(!result.raw.includes(marker), `${path} exposed another user's data`);
    }
    assert.equal((await request(`notes?userId=${victim.id}`)).status, 400);
    assert.equal((await request(`bookmarks?userId=${victim.id}`)).status, 400);
    assert.equal((await request(`highlights?userId=${victim.id}`)).status, 400);
    assert.equal((await request('reading-state')).status, 404);
    assert.equal((await owned('notes', ids.note)).content, 'victim-secret-note');
    assert.ok(await owned('bookmarks', ids.bookmark));
    assert.equal((await owned('highlights', ids.highlight)).color, '#FFD54F');
    assert.equal((await owned('user_reading_state', victim.id)).translation, 'KJV');
});

test('account fields stay unchanged when extra owner or account fields are submitted', async () => {
    const before = (await database.pool.query('SELECT email,first_name,password_hash,email_verified_at FROM users WHERE id=$1', [victim.id])).rows[0];
    const body = { bookId, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 1,
        content: 'attacker-own-note', user_id: victim.id, userId: victim.id, email: 'changed@fixture.invalid',
        first_name: 'Changed', password_hash: 'changed', email_verified_at: new Date().toISOString() };
    const created = await request('notes', 'POST', body);
    assert.equal(created.status, 201);
    assert.equal(created.data.user_id, attacker.id);
    const edited = await request(`notes/${created.data.id}`, 'PATCH', { ...body, content: 'edited' });
    assert.equal(edited.status, 200);
    assert.equal((await owned('notes', created.data.id, attacker)).user_id, attacker.id);
    const bookmark = await request('bookmarks', 'POST', body);
    assert.equal(bookmark.status, 201);
    assert.equal(bookmark.data.user_id, attacker.id);
    const position = await request('reading-state', 'PUT', { bookId, chapter: 1, translation: 'KJV', ...body });
    assert.equal(position.status, 200);
    assert.equal(position.data.user_id, attacker.id);
    const after = (await database.pool.query('SELECT email,first_name,password_hash,email_verified_at FROM users WHERE id=$1', [victim.id])).rows[0];
    assert.deepEqual(after, before);
    const profile = await request(`auth/profile?userId=${victim.id}`);
    assert.equal(profile.status, 200);
    assert.equal(profile.data.id, attacker.id);
    assert.equal((await request('auth/profile', 'PATCH', { ...body, id: victim.id })).status, 404);
});

test('account deletion ignores a forged target account ID', async () => {
    const result = await request('auth/account', 'DELETE', { password: attacker.password, userId: victim.id });
    assert.equal(result.status, 200);
    assert.equal((await database.pool.query('SELECT id FROM users WHERE id=$1', [attacker.id])).rows.length, 0);
    assert.equal((await database.pool.query('SELECT id FROM users WHERE id=$1', [victim.id])).rows.length, 1);
});
