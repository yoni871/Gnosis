const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { contextFromEnvironment, createTestPool } = require('../helpers/application-database');
const { withUser } = require('../../src/db/userContext');
const { startBackend, workerEnvironment } = require('../helpers/backend-instance');
const context = contextFromEnvironment();
let database, worker, bookId;
test.before(async () => { database = await createTestPool(context); bookId = (await database.pool.query('SELECT id FROM bible_books ORDER BY id LIMIT 1')).rows[0].id; worker = await startBackend(context); });
test.after(async () => { if (worker) await worker.stop(); if (database) await database.close(); });
async function account() {
    const id = (await database.pool.query('INSERT INTO users(email) VALUES ($1) RETURNING id', [`pages-${crypto.randomUUID()}@fixture.invalid`])).rows[0].id;
    const sid = crypto.randomUUID();
    await database.pool.query("INSERT INTO auth_sessions(id,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')", [sid, id]);
    return { id, token: jwt.sign({ userId: id, sid }, workerEnvironment().JWT_SECRET, { algorithm: 'HS256', issuer: 'gnosis', audience: 'gnosis-api', expiresIn: '1h' }) };
}
async function request(user, path, method = 'GET', body) {
    const res = await fetch(worker.url + '/api/' + path, { method, headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json', Connection: 'close' },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    const text = await res.text(); return { status: res.status, data: JSON.parse(text), res, bytes: Buffer.byteLength(text) };
}
async function seedNotes(user, count, content = 'Private fixture note') {
    // Seed data runs as the app role under RLS, so it must carry the
    // owner's context like any other user-data write: a context-free
    // INSERT fails the policy WITH CHECK (42501).
    return withUser(database.pool, user.id, client => client.query(`INSERT INTO notes(user_id,book_id,start_chapter,start_verse,end_chapter,end_verse,content)
        SELECT $1,$2,1,1,1,1,$3 FROM generate_series(1,$4::integer) RETURNING id`, [user.id, bookId, content, count]));
}
const note = { bookId: 1, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 1, content: 'Created safely' };
test('cursor pages isolate accounts and have no duplicates/skips despite a new insert', async () => {
    const user = await account(), other = await account();
    const seeded = await seedNotes(user, 55); await seedNotes(other, 3, 'other-private-marker');
    const ids = []; let cursor = null, iteration = 0;
    do {
        const page = await request(user, 'notes?limit=7' + (cursor ? `&cursor=${cursor}` : ''));
        assert.equal(page.status, 200); assert.equal(page.res.headers.get('cache-control'), 'no-store');
        assert.ok(page.data.items.every(item => item.user_id === user.id));
        assert.ok(!JSON.stringify(page.data).includes('other-private-marker'));
        ids.push(...page.data.items.map(row => row.id)); cursor = page.data.nextCursor;
        if (iteration++ === 0) await seedNotes(user, 1, 'new-after-cursor');
    } while (cursor);
    assert.equal(ids.length, 55); assert.equal(new Set(ids).size, 55);
    assert.deepEqual(new Set(ids), new Set(seeded.rows.map(row => row.id)));
    assert.equal((await request(other, `notes/${ids[0]}`)).status, 404);
});
test('notes are byte-budgeted and every page remains resumable', async () => {
    const user = await account(); await seedNotes(user, 20, 'x'.repeat(32768));
    const page = await request(user, 'notes?limit=20');
    assert.equal(page.status, 200); assert.ok(page.bytes <= 512 * 1024);
    assert.ok(page.data.items.length < 20 && page.data.items.length > 0);
    const rest = await request(user, `notes?limit=20&cursor=${page.data.nextCursor}`);
    assert.equal(page.data.items.length + rest.data.items.length, 20);
});
test('malformed, duplicated and excessive private page inputs are controlled 400s', async () => {
    const user = await account();
    for (const query of ['limit=0', 'limit=21', 'cursor=1junk', 'cursor[]=1', 'limit=2&limit=3', 'userId=2']) {
        const res = await request(user, 'notes?' + query); assert.equal(res.status, 400); assert.equal(res.data.code, 'INVALID_PAGE');
    }
});
test('concurrent note creation cannot exceed the per-user quota', async () => {
    const user = await account(); await seedNotes(user, 999);
    const results = await Promise.all(Array.from({ length: 8 }, () => request(user, 'notes', 'POST', { ...note, bookId })));
    assert.equal(results.filter(r => r.status === 201).length, 1);
    assert.equal(results.filter(r => r.status === 409 && r.data.code === 'RESOURCE_LIMIT').length, 7);
    assert.equal((await withUser(database.pool, user.id, client =>
        client.query('SELECT count(*)::int AS n FROM notes WHERE user_id=$1', [user.id]))).rows[0].n, 1000);
});
test('note byte quota blocks growth while allowing edits that free space', async () => {
    const user = await account(), seeded = await seedNotes(user, 64, 'x'.repeat(32768));
    assert.equal((await request(user, 'notes', 'POST', { ...note, bookId })).status, 409);
    assert.equal((await request(user, `notes/${seeded.rows[0].id}`, 'PATCH', { content: 'smaller' })).status, 200);
    assert.equal((await request(user, 'notes', 'POST', { ...note, bookId })).status, 201);
});
test('bookmark pages and passage filters are bounded and owner-scoped', async () => {
    const user = await account(), other = await account();
    for (const owner of [user, other]) await withUser(database.pool, owner.id, client => client.query(`INSERT INTO bookmarks(user_id,book_id,start_chapter,start_verse,end_chapter,end_verse)
        SELECT $1,$2,1,g,1,g FROM generate_series(1,55) g`, [owner.id, bookId]));
    const first = await request(user, `bookmarks?limit=10&bookId=${bookId}&chapter=1`);
    assert.equal(first.status, 200); assert.equal(first.data.items.length, 10);
    const second = await request(user, `bookmarks?limit=10&cursor=${first.data.nextCursor}`);
    assert.ok([...first.data.items, ...second.data.items].every(row => row.user_id === user.id));
    assert.equal(new Set([...first.data.items, ...second.data.items].map(row => row.id)).size, 20);
});
test('bookmark creation quota is atomic under a concurrent burst', async () => {
    const user = await account();
    await withUser(database.pool, user.id, client => client.query(`INSERT INTO bookmarks(user_id,book_id,start_chapter,start_verse,end_chapter,end_verse)
        SELECT $1,$2,1,g,1,g FROM generate_series(1,1999) g`, [user.id, bookId]));
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => request(user, 'bookmarks', 'POST',
        { bookId, startChapter: 50, startVerse: i + 1, endChapter: 50, endVerse: i + 1 })));
    assert.equal(results.filter(r => r.status === 201).length, 1);
    assert.equal(results.filter(r => r.status === 409 && r.data.code === 'RESOURCE_LIMIT').length, 5);
});
test('highlight paging/filtering and quota preserve recoloring at the limit', async () => {
    const user = await account();
    await withUser(database.pool, user.id, client => client.query(`INSERT INTO highlights(user_id,book_id,chapter,verse,color)
        SELECT $1,$2,2+(g/1000),1+(g%1000),'#FFD54F' FROM generate_series(1,9999) g`, [user.id, bookId]));
    const body = { bookId, verses: [{ chapter: 1, verse: 1 }], color: '#112233' };
    assert.equal((await request(user, 'highlights', 'POST', body)).status, 200);
    assert.equal((await request(user, 'highlights', 'POST', { ...body, color: '#445566' })).status, 200);
    const blocked = await request(user, 'highlights', 'POST', { ...body, verses: [{ chapter: 1, verse: 2 }] });
    assert.equal(blocked.status, 409); assert.equal(blocked.data.code, 'RESOURCE_LIMIT');
    const page = await request(user, `highlights?limit=100&bookId=${bookId}&chapter=1`);
    assert.equal(page.status, 200); assert.equal(page.data.items.length, 1); assert.equal(page.data.items[0].color, '#445566');
    const global = await request(user, 'highlights?limit=20'); assert.equal(global.data.items.length, 20); assert.ok(global.data.nextCursor);
});
