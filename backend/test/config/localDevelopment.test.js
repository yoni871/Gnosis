const test = require('node:test');
const assert = require('node:assert/strict');
const { assertLocalDatabase } = require('../../src/config/localDevelopment');
const { validateEmailConfig } = require('../../src/config/emailConfig');
const { createResendClient } = require('../../src/utils/resendClient');
const local = { NODE_ENV: 'development', GNOSIS_LOCAL_DEV: '1', EMAIL_DELIVERY: 'disabled',
    FRONTEND_URL: 'http://localhost:5173', DB_HOST: '127.0.0.1', DB_PORT: '55432',
    DB_NAME: 'gnosis_local', DB_USER: 'gnosis_reader', DB_PASSWORD: 'synthetic' };
test('local reader accepts HTTP loopback without email credentials', () => {
    assert.ok(validateEmailConfig(local).config);
    assert.doesNotThrow(() => assertLocalDatabase(local));
});
test('disabled delivery and HTTP cannot enter production or ordinary startup', () => {
    for (const env of [{ ...local, NODE_ENV: 'production' }, { ...local, GNOSIS_LOCAL_DEV: '' }]) {
        assert.ok(validateEmailConfig(env).errors);
    }
    for (const origin of ['http://remote.example', 'http://localhost.evil.test:5173', 'http://user:pass@localhost:5173']) {
        assert.ok(validateEmailConfig({...local, FRONTEND_URL: origin}).errors);
    }
});
test('local database guard rejects URL precedence, remote hosts and other databases', () => {
    for (const override of [{ DATABASE_URL: 'postgres://remote.invalid/db' }, { DB_HOST: 'remote.invalid' },
        { DB_NAME: 'production' }, { NODE_ENV: 'production' }, { DB_PASSWORD: '' }, { DB_PORT: '0' }]) {
        assert.throws(() => assertLocalDatabase({...local, ...override}));
    }
});
test('disabled delivery never calls the network and does not return a verification token', async () => {
    const client = createResendClient({env: local, fetchImpl: () => assert.fail('Network must not run')});
    await assert.rejects(client.sendVerificationEmail({to:'test@example.invalid',token:'synthetic'}), /disabled/);
});

test('Mailpit cannot send email in production or without the explicit local profile', async () => {
    for (const env of [{...local,EMAIL_DELIVERY:'mailpit',NODE_ENV:'production'},
        {...local,EMAIL_DELIVERY:'mailpit',GNOSIS_LOCAL_DEV:''}]) {
        assert.ok(validateEmailConfig(env).errors);
        const client=createResendClient({env,fetchImpl:()=>assert.fail('Must not contact Mailpit')});
        await assert.rejects(client.sendVerificationEmail({to:'test@example.invalid',token:'synthetic'}),/invalid/);
    }
});
test('local Mailpit is a fixed loopback sink with no Resend credential forwarding', async () => {
    let called=false;
    const client=createResendClient({env:{...local,EMAIL_DELIVERY:'mailpit',RESEND_API_KEY:'private-marker'},
        fetchImpl:async(url,options)=>{
            called=true;assert.equal(url,'http://127.0.0.1:8025/api/v1/send');
            assert.ok(!JSON.stringify(options).includes('private-marker'));
            assert.match(JSON.parse(options.body).Text,/http:\/\/localhost:5173\/verify-email#token=/);
            return {ok:true};
        }});
    await client.sendVerificationEmail({to:'test@example.invalid',token:'synthetic'});assert.ok(called);
});

test('local reference data does not stay stale in browser caches after an update',()=>{
    const oldMode=process.env.NODE_ENV,oldLocal=process.env.GNOSIS_LOCAL_DEV;
    try{
        process.env.NODE_ENV='development';process.env.GNOSIS_LOCAL_DEV='1';
        let header;let continued=false;
        require('../../src/middleware/cacheHeaders').cacheControl()({}, {set:(name,value)=>{header=value;}},()=>{continued=true;});
        assert.equal(header,'no-store');assert.ok(continued);
        process.env.NODE_ENV='production';
        require('../../src/middleware/cacheHeaders').cacheControl()({}, {set:(name,value)=>{header=value;}},()=>{});
        assert.match(header,/^public, max-age=/);
    }finally{
        if(oldMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldMode;
        if(oldLocal===undefined)delete process.env.GNOSIS_LOCAL_DEV;else process.env.GNOSIS_LOCAL_DEV=oldLocal;
    }
});
