// Read-only verification using the restricted runtime role and the real Vite proxy.
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {Client}=require('pg');
const {root,translations,commentaryKeys,readCollection}=require('./catalog');
const {loadLocalEnvironment}=require('../../src/config/localDevelopment');
async function json(route) {
    let response;
    try{response=await fetch('http://localhost:5173'+route,{signal:AbortSignal.timeout(60000)});}
    catch{const error=new Error(`Local API request timed out or failed: ${route}`);error.safe=true;throw error;}
    assert.equal(response.status,200,route);return response.json();
}
async function check() {
    loadLocalEnvironment();
    const e=process.env,db=new Client({host:e.DB_HOST,port:Number(e.DB_PORT),database:e.DB_NAME,user:e.DB_USER,password:e.DB_PASSWORD});
    await db.connect();
    try {
        const identity=(await db.query('SELECT current_user AS role,current_database() AS db')).rows[0];
        assert.equal(identity.role,'gnosis_reader');assert.equal(identity.db,'gnosis_local');
        const grants=(await db.query("SELECT has_sequence_privilege(current_user,'licensed_chapter_cache_id_seq','USAGE') AS cache_seq, has_table_privilege(current_user,'licensed_chapter_cache','SELECT,INSERT,UPDATE,DELETE') AS cache, has_table_privilege(current_user,'ol_word_occurrences','SELECT') AS language")).rows[0];
        assert.ok(grants.cache_seq && grants.cache && grants.language,'Runtime provider/language grants missing');
        const books=await json('/api/books');assert.equal(books.length,66);
        const genesis=books.find(b=>b.name==='Genesis');
        assert.equal((await json(`/api/books/${genesis.id}/chapters`)).length,50);
        const listed=await json('/api/translations');
        const {parseWorkbook}=require('../../../tools/bible-import/src/parseWorkbook');
        for(const t of translations) {
            assert.ok(listed.some(r=>r.abbreviation===t.abbreviation),t.abbreviation);
            const expected=parseWorkbook(path.join(root,t.file)).records.length;
            const actual=Number((await db.query(`SELECT count(*) FROM bible_verses v JOIN bible_translations t ON t.id=v.translation_id
                WHERE t.abbreviation=$1`,[t.abbreviation])).rows[0].count);
            assert.equal(actual,expected,`${t.abbreviation} source/database count`);
            assert.equal((await json(`/api/bible/Genesis/1/${t.abbreviation}`)).length,31);
            assert.equal((await json(`/api/bible/Revelation/22/${t.abbreviation}`)).length,21);
            console.log(`${t.abbreviation}: ${actual} verses; chapter API OK`);
        }
        const comments=await json('/api/commentaries');
        let total=0;
        for(const key of commentaryKeys) {
            const c=readCollection(key),row=comments.find(r=>r.title===c.title);
            assert.ok(row,`Missing commentary ${key}`);
            const actual=Number((await db.query('SELECT count(*) FROM commentary_entries WHERE commentary_id=$1',[row.id])).rows[0].count);
            assert.equal(actual,c.records.length,`${key} source/database count`);total+=actual;
        }
        assert.equal(comments.length,commentaryKeys.length);
        console.log(`Commentaries: ${comments.length} collections, ${total} entries; exact source counts verified`);
        assert.ok((await json('/api/search/bible?q=love&translation=BSB')).length>0);
        assert.ok((await json('/api/search/commentary?q=God')).length>0);
        console.log('Bible and commentary full-text search: OK (main uses unpaginated Bible results and a 100-row commentary cap)');
        for(const [book,chapter] of [['Genesis',1],['Philippians',3]]) {
            const p=await json(`/api/original-language/${book}/${chapter}?startVerse=1&endVerse=5`);
            assert.equal(p.available,true);assert.ok(p.verses.length>0);assert.ok(p.sources.length>0);
            const word=p.verses.flatMap(v=>v.words).find(w=>w.strongNumber);
            assert.ok((await json(`/api/original-language/words/${word.id}`)).wordText);
            console.log(`Original Language ${book} ${chapter}: passage, word detail and attribution OK`);
        }
        const importer=require('../../src/importer/importOriginalLanguage');
        const dataDir=path.join(root,'backend/src/importer/original-language-data');
        let expectedWords=0;
        for(const scope of importer.PHASE_1_SCOPE) {
            const parse=scope.source==='tahot'?importer.parseTahotLine:importer.parseTagntLine;
            for(const line of fs.readFileSync(path.join(dataDir,`${scope.source}.txt`),'utf8').split(/\r?\n/)) {
                const w=parse(line);
                if(w && w.book===scope.book && scope.chapters.includes(w.chapter)
                    && (scope.source==='tahot'?/^[LQ]/.test(w.type):w.inNA28))expectedWords++;
            }
        }
        assert.equal(Number((await db.query('SELECT count(*) FROM ol_word_occurrences')).rows[0].count),expectedWords);
        const repeated=(await db.query('SELECT strong_number FROM ol_word_occurrences WHERE strong_number IS NOT NULL GROUP BY strong_number HAVING count(*)>1 ORDER BY count(*) DESC LIMIT 1')).rows[0];
        const one=await json(`/api/original-language/lemmas/${repeated.strong_number}/occurrences?limit=1&offset=0`);
        const two=await json(`/api/original-language/lemmas/${repeated.strong_number}/occurrences?limit=1&offset=1`);
        assert.ok(one.total>1);assert.equal(one.occurrences.length,1);assert.equal(two.occurrences.length,1);
        assert.notEqual(one.occurrences[0].id,two.occurrences[0].id);
        console.log(`Original Language: ${expectedWords} words; occurrence pagination OK`);
        const licensed=(await db.query("SELECT abbreviation,source,enabled FROM bible_translations WHERE source<>'database' ORDER BY id")).rows;
        assert.deepEqual(licensed.map(t=>t.abbreviation).sort(),['ESV','NASB','NIV','NKJV','NLT'].sort());
        const {isProviderConfigured}=require('../../src/services/licensed/licensedTranslations');
        for(const t of licensed) {
            const configured=t.enabled && isProviderConfigured(t);
            assert.equal(listed.some(r=>r.abbreviation===t.abbreviation),!!configured);
            console.log(`${t.abbreviation}: ${configured?'credentials configured; live provider not called':'unavailable — development provider credentials missing or translation disabled'}`);
        }
        for(const route of ['/api/auth/profile','/api/highlights','/api/bookmarks','/api/reading-state']) {
            assert.equal((await fetch('http://localhost:5173'+route)).status,401);
        }
        console.log('Private routes reject anonymous access; reader and complete catalog are ready.');
    }finally{await db.end();}
}
if(require.main===module)check().catch(error=>{
    console.error(`Local verification failed${(error.safe || error.code==='ERR_ASSERTION')?': '+error.message:'. Check local configuration and server logs.'}`);
    process.exitCode=1;
});
module.exports={check};
