'use strict';
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function parserEnvironment() {
    const env = { TZ: 'UTC' };
    for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TMPDIR', 'TMP', 'TEMP']) {
        if (process.env[key]) env[key] = process.env[key];
    }
    return env;
}
function connectionConfig(value) {
    if (!value) throw new Error('Explicit GNOSIS_BIBLE_IMPORT_DATABASE_URL is required for write.');
    let url;
    try { url = new URL(value); } catch { throw new Error('Invalid import connection configuration.'); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.port ||
        !url.username || !url.password || url.pathname.length < 2 || url.hash || url.search) {
        throw new Error('Import URL requires host, port, database, user and password; URL options are not accepted.');
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    // Remote operators must use verified TLS; local HTTP development is unrelated.
    return { host, port: Number(url.port), database: decodeURIComponent(url.pathname.slice(1)),
        user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
        ssl: ['127.0.0.1', '::1', 'localhost'].includes(host) ? false : { rejectUnauthorized: true },
        options: '', application_name: 'gnosis-offline-bible-import',
        connectionTimeoutMillis: 10000, statement_timeout: 30000, max: 1 };
}
async function main(args = process.argv.slice(2)) {
    // Missing command defaults to validation. Only the literal `write` can load pg.
    const command = ['validate', 'write'].includes(args[0]) ? args.shift() : 'validate';
    const [file, id, name, ...extra] = args;
    if (!file || extra.length || (command === 'validate' && (id || name)) ||
        (command === 'write' && (!/^[1-9]\d*$/.test(id || '') || !name))) {
        throw new Error('Usage: npm start -- [validate] workbook.xlsx | write workbook.xlsx translation-id "Exact translation name"');
    }
    const result = spawnSync(process.execPath, ['--max-old-space-size=256', '-e',
        'process.stdout.write(JSON.stringify(require(process.argv[1]).parseWorkbook(process.argv[2])))',
        path.join(__dirname, 'parseWorkbook.js'), path.resolve(file)], {
        env: parserEnvironment(), timeout: 15000, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8',
    });
    if (result.status !== 0 || result.error) throw new Error('Workbook validation failed or exceeded resource limits. No writes were started.');
    const parsed = JSON.parse(result.stdout);
    if (command === 'validate') {
        console.log(JSON.stringify({ status: 'validated', sheet: parsed.sheet, verses: parsed.records.length, skipped: parsed.skipped }));
        return;
    }
    const config = connectionConfig(process.env.GNOSIS_BIBLE_IMPORT_DATABASE_URL);
    const { Pool } = require('pg');
    const { importBible } = require('./importBible');
    const pool = new Pool(config);
    let failure;
    try {
        console.log(JSON.stringify(await importBible(pool, { records: parsed.records,
            translationId: Number(id), translationName: name })));
    } catch (error) { failure = error; }
    try { await pool.end(); } catch (error) { if (!failure) failure = error; }
    if (failure) throw failure;
}
if (require.main === module) main().catch(() => {
    // Never print connection details or database errors containing operator data.
    console.error('Bible import failed. Verify workbook, explicit translation and connection configuration; no partial transaction is committed.');
    process.exitCode = 1;
});
module.exports = { main, connectionConfig, parserEnvironment };
