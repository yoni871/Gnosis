const test = require('node:test');
const assert = require('node:assert/strict');
const { validNote, MAX_NOTE_BYTES, recordId } = require('../../src/utils/apiValidation');
const { isValidVerseSelection } = require('../../src/utils/highlightValidation');
const good = { bookId: 1, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 2, content: 'Private study' };
test('notes enforce types, bounded UTF-8 storage, ordered coordinates and known fields', () => {
    assert.equal(validNote(good), true);
    assert.equal(validNote({ content: 'edit' }, true), true);
    for (const bad of [null, [], {}, { ...good, content: {} }, { ...good, content: ' ' },
        { ...good, content: 'א'.repeat(MAX_NOTE_BYTES / 2 + 1) },
        { ...good, startChapter: '1' }, { ...good, endVerse: 0 },
        { ...good, endChapter: 0 }, { ...good, bookId: 2 ** 40 },
        { ...good, startVerse: 3 }, { ...good, userId: 2 }]) assert.equal(validNote(bad), false);
    assert.equal(validNote({ startVerse: 4 }, true), false);
});
test('highlight selection has a strict count and coordinate budget', () => {
    assert.equal(isValidVerseSelection([{ chapter: 1, verse: 1 }]), true);
    assert.equal(isValidVerseSelection(Array.from({ length: 501 }, () => ({ chapter: 1, verse: 1 }))), false);
    assert.equal(isValidVerseSelection([{ chapter: 1, verse: 2 ** 40 }]), false);
});
test('malformed resource IDs fail before database/auth lookup', () => {
    for (const value of ['1e2', '01', '-1', '0', '2147483648', '1junk']) {
        let status, nextCalled = false;
        const res = { status(code) { status = code; return this; }, json() {} };
        recordId({}, res, () => { nextCalled = true; }, value);
        assert.equal(status, 400);
        assert.equal(nextCalled, false);
    }
});

test('private PostgreSQL failures never leak diagnostics into controller logs or responses', async t => {
    const pool = require('../../src/db/db');
    t.mock.method(pool, 'query', async () => { throw Object.assign(new Error('private-marker'),
        { detail: 'private-marker', stack: 'private-marker', code: '23514' }); });
    const { createNote } = require('../../src/controllers/notesController');
    const logs = [];
    t.mock.method(console, 'error', (...args) => logs.push(args));
    const res = { statusCode: 0, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    await createNote({ user: { userId: 1 }, body: good }, res);
    assert.equal(res.statusCode, 500);
    assert.ok(!JSON.stringify([logs, res.body]).includes('private-marker'));
    assert.equal(JSON.parse(logs[0][0]).code, '23514');
});
test('log codes cannot contain arbitrary error messages or multiline injection', t => {
    const logs = [];
    t.mock.method(console, 'error', value => logs.push(JSON.parse(value)));
    require('../../src/utils/safeLog').logFailure('synthetic', { code: 'private-marker\nINJECTED', message: 'private-marker' });
    assert.equal(logs[0].code, 'INTERNAL');
    assert.ok(!JSON.stringify(logs).includes('private-marker'));
});

test('search budget bounds clients and concurrent work and releases slots once', () => {
    const { EventEmitter } = require('node:events');
    const { createSearchBudget } = require('../../src/middleware/searchBudget');
    let clock = 0;
    const budget = createSearchBudget({ maxRequests: 2, maxConcurrent: 1, maxClients: 1, windowMs: 100, now: () => clock });
    function request(ip) {
        const res = new EventEmitter();
        res.status = code => { res.code = code; return res; };
        res.set = value => { res.headers = value; return res; };
        res.json = body => { res.body = body; return res; };
        budget({ socket: { remoteAddress: ip } }, res, () => { res.allowed = true; });
        return res;
    }
    const first = request('127.0.0.1');
    assert.equal(first.allowed, true);
    assert.equal(request('127.0.0.1').code, 429);
    first.emit('finish'); first.emit('close');
    const second = request('127.0.0.1');
    assert.equal(second.allowed, true);
    second.emit('finish');
    const blocked = request('127.0.0.1');
    assert.equal(blocked.code, 429);
    assert.equal(blocked.headers['Cache-Control'], 'no-store');
    assert.equal(request('127.0.0.2').code, 429); // State capacity is bounded too.
    clock = 101;
    assert.equal(request('127.0.0.2').allowed, true);
});
