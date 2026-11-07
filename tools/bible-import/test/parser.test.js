const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseRows, parseWorkbook } = require('../src/parseWorkbook');

test('first worksheet, three header rows, references, Psalm mapping and exact Unicode text', t => {
    const XLSX = require('xlsx');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnosis-synthetic-workbook-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
        ['Header', 'Ignored 1:1', 'Not a verse'], [], ['Reference', 'Ignored 1:2', 'Not a verse'],
        [1, 'Genesis 1:1', 'Synthetic “text” — λόγος שלום'], [2, 'Psalm 23:1', '  Preserve spaces  '],
        [3, 'not a reference', 'Skipped'], [], [4, 'John 1:2', 'Second verse'],
    ]), 'First');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[], [], [], [1, 'Other 1:1', 'Never read']]), 'Second');
    const file = path.join(dir, 'synthetic.xlsx'); XLSX.writeFile(book, file);
    const result = parseWorkbook(file);
    assert.equal(result.sheet, 'First');
    assert.deepEqual(result.records, [
        { book: 'Genesis', chapter: 1, verse: 1, text: 'Synthetic “text” — λόγος שלום' },
        { book: 'Psalms', chapter: 23, verse: 1, text: '  Preserve spaces  ' },
        { book: 'John', chapter: 1, verse: 2, text: 'Second verse' },
    ]);
    assert.equal(result.skipped, 2);
});
test('malformed strings skip, non-string reference fails before writes, legacy numeric references remain unchanged', () => {
    assert.throws(() => parseRows([[], [], [], [1, 42, 'Synthetic']]), /Non-text verse/);
    assert.deepEqual(parseRows([[], [], [], [1, 'Genesis 0:0', 'Synthetic']]).records[0],
        { book: 'Genesis', chapter: 0, verse: 0, text: 'Synthetic' });
});
