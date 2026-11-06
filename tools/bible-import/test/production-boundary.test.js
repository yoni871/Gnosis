const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { testEnvironment } = require('../scripts/test');
const { checkArtifact } = require('../scripts/check-artifact');
const root = path.resolve(__dirname, '../../..');
test('backend lock graph excludes SheetJS and preserves HTTP dependency patches', () => {
    const lock = require(path.join(root, 'backend/package-lock.json'));
    assert.ok(!lock.packages[''].dependencies.xlsx);
    assert.ok(!lock.packages['node_modules/xlsx']);
    for (const [name, version] of [['body-parser','2.4.0'],['proxy-addr','2.0.8'],['qs','6.17.1']]) {
        assert.equal(lock.packages[`node_modules/${name}`].version, version);
    }
    const archive = fs.readFileSync(path.join(__dirname, '../vendor/xlsx-0.20.3.tgz'));
    assert.equal(createHash('sha256').update(archive).digest('hex'), '8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8');
    const toolLock = require('../package-lock.json');
    assert.equal(toolLock.packages['node_modules/xlsx'].version, '0.20.3');
    assert.equal(toolLock.packages['node_modules/xlsx'].integrity,
        'sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==');
});
test('real HTTP app starts without loading a spreadsheet parser or opening a database connection', () => {
    const app = path.join(root, 'backend/src/app.js');
    const db = path.join(root, 'backend/src/db/db.js');
    const code = `const M=require('node:module'),load=M._load;require.cache[${JSON.stringify(db)}]={id:${JSON.stringify(db)},filename:${JSON.stringify(db)},loaded:true,exports:{query(){throw Error('No database queries allowed')}}};M._load=function(id,...r){if(id==='xlsx'||id==='pg'||id.includes('bible-import'))throw Error('Forbidden module');return load.call(this,id,...r)};const app=require(${JSON.stringify(app)});const server=app.listen(0,'127.0.0.1',async()=>{try{const r=await fetch('http://127.0.0.1:'+server.address().port+'/');if(!r.ok)process.exitCode=1;}catch{process.exitCode=1}finally{server.closeAllConnections();server.close()}});`;
    const r = spawnSync(process.execPath, ['-e', code], { env: testEnvironment(), encoding: 'utf8', timeout: 10000 });
    assert.equal(r.status, 0, r.stderr);
});
test('artifact guard rejects accidental offline parser inclusion', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnosis-artifact-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = {};');
    assert.equal(checkArtifact(dir), 1);
    fs.mkdirSync(path.join(dir, 'node_modules/xlsx'), { recursive: true });
    assert.throws(() => checkArtifact(dir), /Offline spreadsheet/);
});
