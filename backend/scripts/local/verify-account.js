// Exercise real registration/verification/session/private-data routes, without bypassing checks.
// The dedicated local smoke account persists across updates to detect lost user data.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {root}=require('./catalog');
const {loadLocalEnvironment}=require('../../src/config/localDevelopment');
const base='http://localhost:5173';
let stage='configuration';
async function request(route,{method='GET',body,token,cookie,origin=base,expected=200}={}) {
    const response=await fetch(base+'/api'+route,{method,signal:AbortSignal.timeout(15000),
        headers:{Origin:origin,'X-Gnosis-Session':'1',...(body?{'Content-Type':'application/json'}:{}),
            ...(token?{Authorization:`Bearer ${token}`} : {}),...(cookie?{Cookie:cookie}:{})},
        ...(body?{body:JSON.stringify(body)}:{})});
    assert.equal(response.status,expected,'Unexpected HTTP status');
    return {body:response.status===204?null:await response.json(),cookie:response.headers.get('set-cookie')};
}
async function verifyAccount() {
    loadLocalEnvironment();
    if(process.env.EMAIL_DELIVERY!=='mailpit')throw new Error('This check requires local Mailpit delivery.');
    const dir=path.join(root,'.local');fs.mkdirSync(dir,{recursive:true,mode:0o700});
    const file=path.join(dir,'verification-account.json');
    let state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
    const save=()=>fs.writeFileSync(file,JSON.stringify(state),{mode:0o600});
    if(!state){state={email:`gnosis-local-${randomBytes(8).toString('hex')}@example.invalid`,password:randomBytes(24).toString('hex')};save();}
    if(!state.verified) {
        stage='registration';
        // A previously interrupted run may already have registered this same local test account.
        const existing=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(state)});
        if(existing.status===403)await request('/auth/resend-verification',{method:'POST',body:{email:state.email}});
        if(existing.status===401)await request('/auth/register',{method:'POST',body:{firstName:'Local',lastName:'Verification',email:state.email,password:state.password}});
        stage='email verification';
        let rawToken;
        for(let i=0;i<30;i++) {
            const response=await fetch('http://127.0.0.1:8025/api/v1/search?query='+encodeURIComponent('to:'+state.email));
            const messages=(await response.json()).messages||[];
            if(messages.length){
                const message=await (await fetch('http://127.0.0.1:8025/api/v1/message/'+messages[0].ID)).json();
                rawToken=message.Text?.match(/#token=([A-Za-z0-9_-]{43})/)?.[1];
                if(rawToken)break;
            }
            await new Promise(r=>setTimeout(r,250));
        }
        assert.ok(rawToken,'No local verification email captured');
        await request('/auth/verify-email',{method:'POST',body:{token:rawToken}});
        state.verified=true;save();
    }
    stage='login';
    const login=await request('/auth/login',{method:'POST',body:{email:state.email,password:state.password}});
    assert.ok(login.body.token && login.cookie,'Session missing');
    assert.ok(/HttpOnly/i.test(login.cookie) && /SameSite=Strict/i.test(login.cookie),'Cookie security attributes missing');
    assert.ok(!/;\s*Secure/i.test(login.cookie),'Local HTTP cookie cannot require HTTPS');
    let token=login.body.token,cookie=login.cookie.split(';')[0];
    await request('/auth/profile',{token});
    stage='private data';
    const books=await (await fetch(base+'/api/books')).json();const book=books.find(b=>b.name==='Genesis');
    if(!state.snapshot) {
        await request('/highlights',{method:'POST',token,body:{bookId:book.id,verses:[{chapter:1,verse:1}],color:'#FFD54F'}});
        await request('/bookmarks',{method:'POST',token,expected:201,body:{bookId:book.id,startChapter:1,startVerse:1,endChapter:1,endVerse:1}});
        await request('/notes',{method:'POST',token,expected:201,body:{bookId:book.id,startChapter:1,startVerse:1,endChapter:1,endVerse:1,content:'Persistent local verification note'}});
        await request('/reading-state',{method:'PUT',token,body:{bookId:book.id,chapter:1,translation:'BSB',verse:1}});
        state.snapshot={};
        for(const route of ['/highlights','/bookmarks','/reading-state','/notes'])state.snapshot[route]=(await request(route,{token})).body;
        save();
    }else{
        for(const route of ['/highlights','/bookmarks','/reading-state','/notes']) {
            // The updater must retain IDs and content, including the saved reading timestamp.
            assert.ok(JSON.stringify((await request(route,{token})).body)===JSON.stringify(state.snapshot[route]),'Saved local data changed');
        }
    }
    stage='session renewal';
    const refresh=await request('/auth/refresh',{method:'POST',body:{},cookie});
    assert.ok(refresh.body.token && refresh.cookie,'Refresh missing');
    assert.ok(refresh.cookie.split(';')[0]!==cookie,'Refresh did not rotate');
    token=refresh.body.token;cookie=refresh.cookie.split(';')[0];
    stage='renewed profile';
    await request('/auth/profile',{token});
    stage='Origin rejection';
    await request('/auth/refresh',{method:'POST',body:{},cookie,origin:'http://untrusted.example.invalid',expected:403});
    stage='logout';
    await request('/auth/logout',{method:'POST',body:{},token,cookie,expected:204});
    stage='revoked profile';
    await request('/auth/profile',{token,expected:403});
    console.log('Local authentication: registration, inbox verification, login, cookie security, renewal, Origin rejection and logout OK.');
    console.log('Local highlights, bookmarks, notes and reading progress persisted with unchanged IDs and content.');
}
if(require.main===module)verifyAccount().catch(error=>{console.error(`Local account verification failed at ${stage}. No credentials or tokens are logged.`);if(error.code==='ERR_ASSERTION')console.error(error.message);process.exitCode=1;});
module.exports={verifyAccount};
