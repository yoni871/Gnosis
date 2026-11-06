const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { connectionConfig, parserEnvironment } = require('../src/cli');
const { testEnvironment } = require('../scripts/test');

test('validation is the default; only explicit write can request a connection', t => {
    const XLSX = require('xlsx');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnosis-cli-test-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'synthetic.xlsx');
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[], [], [], [1, 'Genesis 1:1', 'Synthetic']]));
    XLSX.writeFile(book, file);
    const blocker = path.join(dir, 'block-pg.cjs');
    fs.writeFileSync(blocker, `const M=require('node:module');const load=M._load;M._load=function(id,...rest){if(id==='pg')throw new Error('PG_LOADED');return load.call(this,id,...rest)};`);
    const run = args => spawnSync(process.execPath, ['--require', blocker, 'src/cli.js', ...args], {
        env: { ...testEnvironment(), DATABASE_URL: 'poison', DB_HOST: 'poison', PGHOST: 'poison' },
        encoding: 'utf8', timeout: 20000,
    });
    for (const args of [[file], ['validate', file]]) {
        const r = run(args); assert.equal(r.status, 0, r.stderr);
        assert.equal(JSON.parse(r.stdout).status, 'validated');
    }
    const r = run(['write', file, '4', 'Synthetic']);
    assert.equal(r.status, 1); assert.doesNotMatch(r.stderr, /poison|PG_LOADED/);
    fs.writeFileSync(file, 'Not a ZIP file');
    assert.equal(run([file]).status, 1);
});
test('explicit complete import URL only; no dotenv, pg defaults or URL option fallback', () => {
    assert.throws(() => connectionConfig(), /Explicit/);
    for (const url of ['postgres://localhost/db', 'postgres://u:p@localhost:5432/db?sslmode=disable']) {
        assert.throws(() => connectionConfig(url));
    }
    const c = connectionConfig('postgres://synthetic:synthetic@127.0.0.1:5432/synthetic');
    assert.equal(c.options, ''); assert.equal(c.ssl, false);
    assert.deepEqual(connectionConfig('postgres://synthetic:synthetic@example.invalid:5432/synthetic').ssl, { rejectUnauthorized: true });
    assert.ok(!Object.keys(parserEnvironment()).some(k => /DATABASE|^DB_|^PG|JWT|RESEND|NODE_OPTIONS/.test(k)));
});
test('importing parser, writer and CLI does not load pg, dotenv, XLSX or app database', () => {
    const code = `const M=require('node:module'),load=M._load;M._load=function(id,...r){if(['pg','xlsx','dotenv'].includes(id)||id.includes('/db/db'))throw Error('forbidden');return load.call(this,id,...r)};require('./src/parseWorkbook');require('./src/importBible');require('./src/cli');`;
    const r = spawnSync(process.execPath, ['-e', code], { env: testEnvironment(), encoding: 'utf8', timeout: 5000 });
    assert.equal(r.status, 0, r.stderr);
});
