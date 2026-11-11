const fs=require('node:fs');
const path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.local'),file=path.join(dir,'services.json');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function healthy(url) {try{return (await fetch(url,{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}}
async function stop() {
    if(!fs.existsSync(file))return;
    const state=JSON.parse(fs.readFileSync(file,'utf8'));
    for(const key of ['backend','frontend']) {
        const pid=state[key];
        if(!Number.isInteger(pid))continue;
        // Never signal a reused PID unless its actual command matches our recorded program.
        const command=spawnSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'}).stdout||'';
        if(command.includes(state[`${key}Program`])) {
            try{process.kill(-pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}
        }
    }
    fs.unlinkSync(file);
    await sleep(1000);
}
async function start() {
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    if(fs.existsSync(file))await stop();
    if(await healthy('http://127.0.0.1:5000/') || await healthy('http://localhost:5173/')) {
        throw new Error('Port 5000 or 5173 is already in use. Stop manually started dev servers, then rerun local:update.');
    }
    const state={};
    for(const [key,program,cwd] of [
        ['backend',path.join(root,'backend/scripts/local/dev.js'),path.join(root,'backend')],
        ['frontend',path.join(root,'frontend/node_modules/vite/bin/vite.js'),path.join(root,'frontend')],
    ]) {
        const log=fs.openSync(path.join(dir,`${key}.log`),'a',0o600);
        const args=key==='frontend'?[program,'--host','localhost']:[program];
        const child=spawn(process.execPath,args,{cwd,detached:true,stdio:['ignore',log,log],env:process.env});
        child.unref();fs.closeSync(log);state[key]=child.pid;state[`${key}Program`]=program;
    }
    fs.writeFileSync(file,JSON.stringify(state),{mode:0o600});
    for(let i=0;i<60;i++) {
        if(await healthy('http://127.0.0.1:5000/') && await healthy('http://localhost:5173/'))return;
        await sleep(500);
    }
    await stop();throw new Error('Dev servers failed to become ready. Inspect .local/backend.log and .local/frontend.log.');
}
if(require.main===module)(process.argv[2]==='stop'?stop():start()).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={start,stop};
