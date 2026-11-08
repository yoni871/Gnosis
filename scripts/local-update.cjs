const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
function run(cmd,args,options={}) {
    const result=spawnSync(cmd,args,{cwd:root,stdio:'inherit',...options});
    if(result.status!==0) throw new Error(`${cmd} ${args[0]} failed; previous local data is preserved.`);
}
async function main() {
    if(process.argv.slice(2).some(arg=>arg!=='--refresh-language'))throw new Error('Only --refresh-language is supported.');
    if(process.env.NODE_ENV==='production')throw new Error('Production settings cannot be used by local:update.');
    if(!/^v22\./.test(process.version)) throw new Error('Install Node 22.x first.');
    // Exclusive filesystem lock: concurrent updaters must never restart each other's services.
    const state=path.join(root,'.local');fs.mkdirSync(state,{recursive:true,mode:0o700});
    const lock=path.join(state,'update.lock');
    let acquired=false;
    try {
        fs.writeFileSync(lock,String(process.pid),{flag:'wx',mode:0o600});acquired=true;
        run(process.execPath,['scripts/local-services.cjs','stop']);
        // Reinstall only when the lockfile/platform changes or npm detects missing/invalid packages.
        const dependencyFile=path.join(state,'dependencies.json');
        let dependencies={};
        try{dependencies=JSON.parse(fs.readFileSync(dependencyFile,'utf8'));}catch{/* First run or interrupted cache write. */}
        for(const dir of ['backend','frontend','tools/bible-import']) {
            const fingerprint=createHash('sha256').update(fs.readFileSync(path.join(root,dir,'package-lock.json')))
                .update(fs.readFileSync(path.join(root,dir,'package.json')))
                .update(`${process.version}:${process.platform}:${process.arch}`).digest('hex');
            const installed=dependencies[dir]===fingerprint && spawnSync('npm',['ls','--all','--json','--prefix',dir],
                {cwd:root,stdio:'ignore',timeout:30000}).status===0;
            if(installed)console.log(`${dir}: locked dependencies verified`);
            else {
                run('npm',['ci','--prefer-offline','--prefix',dir,...(dir==='tools/bible-import'?['--ignore-scripts']:[])]);
                dependencies[dir]=fingerprint;
                fs.writeFileSync(dependencyFile,JSON.stringify(dependencies),{mode:0o600});
            }
        }
        run(process.execPath,['backend/scripts/local/setup.js']);
        require('../backend/src/config/localDevelopment').loadLocalEnvironment();
        const env=process.env;
        const {connectionFor}=require('../backend/scripts/migrations/config');
        const config=connectionFor('local',env);
        if(config.database!=='gnosis_local' || config.host!=='127.0.0.1' || config.port!==55432
            || env.DB_USER!=='gnosis_reader' || env.DB_PORT!=='55432') throw new Error('Use the isolated local Compose settings.');
        const {composeArgs,assertLocalDocker}=require('../backend/scripts/local/isolated-database');
        assertLocalDocker(env);
        const check=spawnSync('docker',['info','--format','{{.ServerVersion}}'],{stdio:'ignore',timeout:10000});
        if(check.status!==0) {
            if(process.platform!=='darwin') throw new Error('Start Docker first.');
            run('open',['-a','Docker']);
            let ready=false;
            for(let i=0;i<30;i++) {
                const attempt=spawnSync('docker',['info','--format','{{.ServerVersion}}'],{stdio:'ignore',timeout:5000});
                if(attempt.status===0){ready=true;break;}
                await new Promise(resolve=>setTimeout(resolve,1000));
            }
            if(!ready)throw new Error('Docker did not become ready; inspect Docker Desktop and rerun.');
        }
        run('docker',composeArgs(['up','-d','--wait']));
        // Stop only our managed dev processes before changing the schema/data.
        run(process.execPath,['scripts/local-services.cjs','stop']);
        run(process.execPath,['backend/scripts/local/prepare.js',...process.argv.slice(2)]);
        run(process.execPath,['scripts/local-services.cjs','start']);
        run(process.execPath,['backend/scripts/local/check.js']);
        if(env.EMAIL_DELIVERY==='mailpit')run(process.execPath,['backend/scripts/local/verify-account.js']);
        else console.log('Authentication smoke skipped: EMAIL_DELIVERY is not the local Mailpit mode.');
        console.log('Ready: http://localhost:5173 — local email inbox: http://localhost:8025');
    } finally {if(acquired)fs.unlinkSync(lock);}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
