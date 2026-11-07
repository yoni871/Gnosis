// Narrow compatibility for two already-reviewed index migrations merged behind
// the Original Language timestamp. Never permits arbitrary late migrations.
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {safeError}=require('./config');
const approved=new Map([
    ['20261107005916_add-licensed-cache-verse-count-index','cca55760f88948ff338ef85ab30553a1d39bc9b6e45577e2e30c3e55bfde2831'],
    ['20261107010016_add-licensed-ip-limits-window-index','18b3e47cf1a4cc88853862a5834312fd05bd9c9d098ac926c7ccdb97f6dd3961'],
]);
async function validateLocalLateIndexes({target,command,env,dir}) {
    if(!['up','check'].includes(command) || target==='production')throw safeError('Late-index compatibility is forbidden for this operation.');
    if(target==='local') {
        require('../../src/config/localDevelopment').assertLocalDatabase(env);
        if(env.GNOSIS_LOCAL_DEV!=='1' || env.MIGRATION_DB_NAME!=='gnosis_local')throw safeError('Late-index compatibility is local-only.');
    }else if(target!=='test' || env.GNOSIS_TEST_ISOLATION!=='1')throw safeError('Late-index compatibility requires explicit disposable test isolation.');
    for(const [name,expected] of approved) {
        const actual=createHash('sha256').update(await fs.readFile(path.join(dir,name+'.sql'))).digest('hex');
        if(actual!==expected)throw safeError('Reviewed local index migration changed; explicit review is required.');
    }
}
function orderedLocalHistory(rows,names) {
    if(new Set(rows).size!==rows.length || rows.some(n=>!names.includes(n)))throw safeError('Unknown or duplicate local migration history.');
    const stableRows=rows.filter(n=>!approved.has(n));
    const stableNames=names.filter(n=>!approved.has(n));
    if(stableRows.some((name,i)=>name!==stableNames[i]))throw safeError('Unreviewed late migration; local history was not changed.');
    // Logical order only: pgmigrations rows, IDs and timestamps are never rewritten.
    return [...rows].sort((a,b)=>names.indexOf(a)-names.indexOf(b));
}
module.exports={validateLocalLateIndexes,orderedLocalHistory};
