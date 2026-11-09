const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
test('nodemon matches watched extensions and exclusions with patched minimatch', () => {
    const nodemon = createRequire(require.resolve('nodemon'));
    assert.ok(require('semver').gte(nodemon('minimatch/package.json').version, '11.0.1'));
    const match = require('nodemon/lib/monitor/match');
    const file = path.resolve('src/synthetic.js');
    const ignored = path.resolve('node_modules/synthetic.js');
    const css = path.resolve('src/synthetic.css');
    assert.deepEqual(match([file, ignored, css], ['**/*', '!**/node_modules/**'], 'js,json').result, [file]);
});
test('patched glob preserves SQL discovery and PathScurry contracts used by migrations', async t => {
    const migrationRequire = createRequire(require.resolve('node-pg-migrate'));
    assert.ok(require('semver').gte(migrationRequire('glob/package.json').version, '14.0.2'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnosis-glob-regression-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const names = ['1700000000001_second.sql', '1700000000000_first.sql', '1700000000002_ignored.sql'];
    for (const name of names) fs.writeFileSync(path.join(dir, name), 'SELECT 1;');
    const { glob } = migrationRequire('glob');
    const result = await glob(path.join(dir, '*.sql'), { ignore: ['**/*ignored.sql'], nodir: true, withFileTypes: true });
    assert.deepEqual(result.map(entry => path.basename(entry.fullpath())).sort(), [names[1], names[0]]);
    assert.ok(result.every(entry => typeof entry.name === 'string'));
});
