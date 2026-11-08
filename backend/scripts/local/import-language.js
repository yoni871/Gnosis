const fs=require('node:fs');
const path=require('node:path');
const {root,hashFiles}=require('./catalog');
const {current,ledger,transaction}=require('./import-content');
async function importLanguage(db,{refresh=false}={}) {
    const importerPath=path.join(root,'backend/src/importer/importOriginalLanguage.js');
    const importer=require(importerPath);
    const dir=path.join(root,'backend/src/importer/original-language-data');
    await importer.downloadStepBibleFiles(dir,{refresh});
    const files=Object.keys(importer.STEPBIBLE_FILES).sort().map(k=>path.join(dir,`${k}.txt`));
    if(files.some(f=>fs.statSync(f).size===0)) throw new Error('Empty original-language source file.');
    const hash=hashFiles([importerPath,...files]);
    if(await current(db,'original-language',hash,'SELECT count(*) FROM ol_word_occurrences')) {
        console.log('Original language: unchanged');return;
    }
    await transaction(db,async()=>{
        const counts=await importer.importOriginalLanguage({dataDir:dir,pool:db});
        if(!counts.words) throw new Error('No original-language words imported.');
        const n=Number((await db.query('SELECT count(*) FROM ol_word_occurrences')).rows[0].count);
        await ledger(db,'original-language',hash,n);
        console.log(`Original language: ${counts.words} words synchronized for main's supported scope.`);
    });
}
module.exports={importLanguage};
