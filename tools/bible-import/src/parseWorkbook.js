'use strict';
const fs = require('node:fs');
const MAX_BYTES = 16 * 1024 * 1024;

// Row interpretation is independent of the workbook library and all database code.
function parseRows(rows) {
    const records = [];
    let skipped = 0;
    for (let i = 3; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 3) { skipped++; continue; }
        const reference = row[1];
        if (typeof reference !== 'string') throw new Error(`Non-text verse reference at row ${i + 1}.`);
        const match = reference.match(/^(.+)\s(\d+):(\d+)$/);
        if (!match) { skipped++; continue; }
        records.push({ book: match[1] === 'Psalm' ? 'Psalms' : match[1],
            chapter: Number.parseInt(match[2], 10), verse: Number.parseInt(match[3], 10), text: row[2] });
    }
    return { records, skipped };
}

function parseWorkbook(file) {
    if (!/\.xlsx$/i.test(file)) throw new Error('Only .xlsx workbooks are supported.');
    const fd = fs.openSync(file, 'r');
    let bytes;
    try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('Workbook must be a regular file of at most 16 MiB.');
        bytes = fs.readFileSync(fd);
        if (bytes.length > MAX_BYTES || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Invalid XLSX archive.');
    } finally { fs.closeSync(fd); }
    const XLSX = require('xlsx'); // Loaded only by the explicitly invoked offline decoder.
    const workbook = XLSX.read(bytes, { type: 'buffer', sheetRows: 200001 });
    const first = workbook.Sheets[workbook.SheetNames[0]];
    if (!first) throw new Error('Workbook has no first worksheet.');
    const rows = XLSX.utils.sheet_to_json(first, { header: 1 });
    if (rows.length > 200000) throw new Error('Workbook exceeds the 200,000-row limit.');
    return { ...parseRows(rows), sheet: workbook.SheetNames[0] };
}
module.exports = { parseRows, parseWorkbook };
