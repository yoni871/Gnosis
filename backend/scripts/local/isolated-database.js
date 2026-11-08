const {spawnSync}=require('node:child_process');
const {root}=require('./catalog');
function composeArgs(args) {return ['compose','--env-file','backend/.env.local','-f','compose.local.yaml',...args];}
function assertLocalDocker(env, inspect=()=>spawnSync('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],
    {cwd:root,env,encoding:'utf8',timeout:10000})) {
    if(env.DOCKER_HOST && !env.DOCKER_HOST.startsWith('unix://'))throw new Error('Local development requires a local Unix-socket Docker engine.');
    if(env.DOCKER_HOST)return;
    const result=inspect();
    if(result.status!==0 || !(result.stdout||'').trim().startsWith('unix://')) {
        throw new Error('Remote Docker contexts are forbidden for local development.');
    }
}
function containerSystemId(env) {
    assertLocalDocker(env);
    if(env.DB_HOST!=='127.0.0.1' || env.DB_PORT!=='55432' || env.DB_NAME!=='gnosis_local'
        || env.MIGRATION_DB_HOST!==env.DB_HOST || env.MIGRATION_DB_PORT!==env.DB_PORT
        || env.MIGRATION_DB_NAME!==env.DB_NAME || env.MIGRATION_DB_USER!=='gnosis_local_owner') {
        throw new Error('Use the isolated Compose profile on 127.0.0.1:55432.');
    }
    const result=spawnSync('docker',composeArgs(['exec','-T','db','psql','-U','gnosis_local_owner','-d','gnosis_local',
        '-Atc','SELECT system_identifier FROM pg_control_system()']),{cwd:root,env,encoding:'utf8',timeout:30000});
    const id=(result.stdout||'').trim();
    if(result.status!==0 || !/^\d+$/.test(id)) throw new Error('Cannot verify isolated Compose database identity.');
    return id;
}
async function verifyContainerIdentity(db,env) {
    const id=containerSystemId(env);
    const actual=(await db.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0].id;
    if(id!==actual) throw new Error('Database connection does not match the isolated Compose container.');
}
module.exports={composeArgs,containerSystemId,verifyContainerIdentity,assertLocalDocker};
