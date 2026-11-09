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
    t.mock.method(console, 'error', (...args) => logs.push(args.join(' ')));
    const res = { statusCode: 0, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    await createNote({ user: { userId: 1 }, body: good }, res);
    assert.equal(res.statusCode, 500);
    assert.ok(!JSON.stringify([logs, res.body]).includes('private-marker'));
    // logHygiene style (#80, pair 2): one line carrying route, kind, and
    // the safe code only — never the message, detail, or stack.
    const text = logs.join('\n');
    assert.ok(text.includes('notes.create'), text);
    assert.ok(text.includes('kind=database'), text);
    assert.ok(text.includes('code=23514'), text);
});
// Rewritten to logHygiene style (#80, pair 2): the shared logger records
// only route, kind, and code — message and stack never reach the log,
// even when they embed submitted values. NOTE: unlike #75's safeLog,
// #80's logger does not reshape the code itself (it logs any string
// code verbatim); at these call sites the code comes from the pg driver
// (a 5-char SQLSTATE), never from user input. That sanitization is
// dropped with safeLog.js — flagged in the integration report.
test('controller logs record only route, kind, and code — never message or stack', t => {
    const logs = [];
    t.mock.method(console, 'error', (...args) => logs.push(args.join(' ')));
    const { logControllerError } = require('../../src/utils/authErrors');
    logControllerError('notes.create', 'database', Object.assign(new Error('private-marker'),
        { detail: 'private-marker', stack: 'private-marker', code: '23514' }));
    assert.equal(logs.length, 1);
    assert.ok(logs[0].includes('notes.create'), logs[0]);
    assert.ok(logs[0].includes('kind=database'), logs[0]);
    assert.ok(logs[0].includes('code=23514'), logs[0]);
    assert.ok(!logs.join('').includes('private-marker'));
});
