const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {downloadStepBibleFiles}=require('../../src/importer/importOriginalLanguage');
test('official Hebrew URL works, completed files cache, stale files rebuild, failed refresh preserves the previous file',async()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gnosis-public-download-'));
    const original=globalThis.fetch;let calls=0;
    try{
        globalThis.fetch=async url=>{
            calls++;
            // Regression: STEPBible's actual TAHOT filename has a space, not CC-BY.
            if(url.includes('TAHOT'))assert.ok(url.endsWith('STEPBible.org%20CC%20BY.txt'));
            return {ok:true,arrayBuffer:async()=>Buffer.from('Synthetic attributed source fixture')};
        };
        // First run fetches every part: 4 TAHOT + 2 TAGNT + 4 single files.
        await downloadStepBibleFiles(dir);assert.equal(calls,10);
        // Second run fetches nothing: completed files are cached via
        // the manifest written next to each file.
        await downloadStepBibleFiles(dir);assert.equal(calls,10);
        // A file with no manifest (e.g. an old partial download) is
        // never trusted as complete: it is rebuilt once, then cached.
        fs.rmSync(path.join(dir,'tahot.txt.parts.json'));
        await downloadStepBibleFiles(dir);assert.equal(calls,14);
        await downloadStepBibleFiles(dir);assert.equal(calls,14);
        const before=fs.readFileSync(path.join(dir,'tahot.txt'),'utf8');
        globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>{throw new Error('Interrupted synthetic body');}});
        await assert.rejects(downloadStepBibleFiles(dir,{refresh:true}),/Interrupted/);
        assert.equal(fs.readFileSync(path.join(dir,'tahot.txt'),'utf8'),before);
    }finally{globalThis.fetch=original;fs.rmSync(dir,{recursive:true,force:true});}
});
