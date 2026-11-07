const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {root,commentaryKeys,translations,readCollection}=require('../../scripts/local/catalog');
const {transaction,current}=require('../../scripts/local/import-content');
test('manifest covers every repository commentary collection and all stored translations',()=>{
    const folders=fs.readdirSync(root).filter(f=>f.endsWith('-restructured')).map(f=>f.replace(/-restructured$/,'')).sort();
    assert.deepEqual([...commentaryKeys].sort(),folders);
    assert.deepEqual(translations.map(t=>t.abbreviation).sort(),['ASV','BSB','KJV','WEB']);
});
test('Tyndale carries attribution, adaptation notice and ShareAlike license',()=>{
    const data=readCollection('tyndale');
    assert.equal(data.license,'CC BY-SA 4.0');
    assert.match(data.attribution,/Adapted from/);assert.match(data.attribution,/Tyndale House Publishers/);
    assert.equal(data.records.length,16913);
});
test('failed content import rolls back and never marks partial content complete',async()=>{
    const calls=[];const db={query:async q=>{calls.push(q);}};
    const marker=new Error('synthetic failure');
    await assert.rejects(transaction(db,async()=>{throw marker;}),error=>error===marker);
    assert.deepEqual(calls,['BEGIN','ROLLBACK']);
});
test('unchanged hashes still repair missing database content',async()=>{
    let i=0;const db={query:async()=>++i===1?{rows:[{hash:'same',row_count:10}]}:{rows:[{count:'9'}]}};
    assert.equal(await current(db,'fixture','same','SELECT count(*)'),false);
});

test('remote Docker endpoints are rejected before any engine call',()=>{
    const {assertLocalDocker}=require('../../scripts/local/isolated-database');
    assert.throws(()=>assertLocalDocker({DOCKER_HOST:'tcp://remote.example:2376'},()=>assert.fail('No engine call allowed')),/local Unix-socket/);
    assert.throws(()=>assertLocalDocker({},()=>({status:0,stdout:'ssh://remote.example'})),/Remote Docker/);
    assert.doesNotThrow(()=>assertLocalDocker({},()=>({status:0,stdout:'unix:///var/run/docker.sock'})));
});

test('late-index compatibility never relaxes production or unknown migration ordering',async()=>{
    const {orderedLocalHistory,validateLocalLateIndexes}=require('../../scripts/migrations/localLateIndexes');
    await assert.rejects(validateLocalLateIndexes({target:'production',command:'up',env:{},dir:''}),/forbidden/);
    assert.throws(()=>orderedLocalHistory(['baseline','unknown'],['baseline','other']),/Unknown/);
    assert.throws(()=>orderedLocalHistory(['baseline','later'],['baseline','missing','later']),/Unreviewed/);
});
