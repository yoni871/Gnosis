const { test } = require('node:test');
const assert = require('node:assert/strict');
const { importBible } = require('../src/importBible');
function fixture({ existing = 0, failInsert = false, failRollback = false, name = 'Synthetic Translation' } = {}) {
    const calls = [];
    const failure = new Error('synthetic insertion failure');
    let released = 0;
    const client = { async query(sql, params) {
        calls.push({ sql, params });
        if (sql.includes('SELECT name')) return { rows: [{ name }] };
        if (sql.includes('COUNT')) return { rows: [{ count: String(existing) }] };
        if (sql.includes('SELECT id, name')) return { rows: [{ id: 1, name: 'Genesis' }] };
        if (sql.includes('INSERT INTO bible_chapters')) return { rows: [{ id: 7 }] };
        if (failInsert && sql.includes('INSERT INTO bible_verses')) throw failure;
        if (failRollback && sql === 'ROLLBACK') throw new Error('synthetic rollback failure');
        return { rows: [] };
    }, release() { released++; } };
    return { pool: { connect: async () => client, query() { throw new Error('Must use the checked-out client'); } },
        calls, failure, released: () => released };
}
const input = { translationId: 4, translationName: 'Synthetic Translation', records: [
    { book: 'Genesis', chapter: 1, verse: 1, text: 'Synthetic text' },
    { book: 'Genesis', chapter: 1, verse: 2, text: 'More synthetic text' },
    { book: 'Unknown', chapter: 1, verse: 1, text: 'Skipped' },
] };
test('one client owns transaction, translation identity, chapter reuse and parameterized verse writes', async () => {
    const f = fixture();
    assert.deepEqual(await importBible(f.pool, input), { status: 'imported', inserted: 2, unknownBooks: 1 });
    assert.equal(f.calls[0].sql, 'BEGIN'); assert.equal(f.calls.at(-1).sql, 'COMMIT');
    assert.match(f.calls[1].sql, /FOR UPDATE/);
    assert.equal(f.calls.filter(c => c.sql.includes('INSERT INTO bible_chapters')).length, 1);
    assert.deepEqual(f.calls.find(c => c.sql.includes('INSERT INTO bible_verses')).params, [7, 4, 1, 'Synthetic text']);
    assert.equal(f.released(), 1);
});
test('any existing import prevents all chapter/verse writes', async () => {
    const f = fixture({ existing: 1 }); assert.equal((await importBible(f.pool, input)).status, 'skipped-existing');
    assert.ok(!f.calls.some(c => c.sql.includes('INSERT'))); assert.equal(f.released(), 1);
});
test('wrong translation name rolls back without writes', async () => {
    const f = fixture({ name: 'Different' }); await assert.rejects(importBible(f.pool, input), /does not match/);
    assert.equal(f.calls.at(-1).sql, 'ROLLBACK'); assert.ok(!f.calls.some(c => c.sql.includes('INSERT')));
});
test('write failure rolls back; rollback failure preserves original error and releases client', async () => {
    for (const failRollback of [false, true]) {
        const f = fixture({ failInsert: true, failRollback });
        await assert.rejects(importBible(f.pool, input), e => e === f.failure);
        assert.equal(f.calls.at(-1).sql, 'ROLLBACK'); assert.equal(f.released(), 1);
        assert.equal(!!f.failure.rollbackFailed, failRollback);
    }
});
