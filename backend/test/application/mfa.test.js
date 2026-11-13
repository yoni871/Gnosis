const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const { contextFromEnvironment, createTestPool } = require('../helpers/application-database');
const { startBackend } = require('../helpers/backend-instance');
const { generateTotpCode } = require('../../src/utils/mfaTotp');
const { decryptTotpSecret } = require('../../src/utils/mfaCrypto');
const { hashPassword } = require('../../src/utils/passwordHash');
const mfaService = require('../../src/services/mfaService');

// Synthetic encryption key for the disposable worker only. The test
// file sets it before startBackend, and backend-instance forwards it
// to the worker (test isolation only) — mirroring the Resend stub
// override. The key never leaves this disposable run.
const MFA_KEY = crypto.randomBytes(32).toString('hex');
process.env.MFA_ENCRYPTION_KEY = MFA_KEY;
// Admin-mandatory MFA (design §9): these synthetic admin emails are
// forwarded to the worker the same way, so the login gate can be
// exercised. The admin users are created by the tests below.
const ADMIN_EMAILS = ['mfa-admin-1@example.invalid', 'mfa-admin-2@example.invalid'];
process.env.ADMIN_EMAILS = ADMIN_EMAILS.join(',');

const context = contextFromEnvironment();
let database, worker;
const password = 'synthetic-mfa-password';
// One fresh account per test: MFA enrollment state persists per
// user, so sharing one account would couple the tests together.
let userCounter = 0;

test.before(async () => {
    database = await createTestPool(context);
    worker = await startBackend(context);
});
test.beforeEach(async () => { await database.pool.query('DELETE FROM rate_limit_attempts'); });
test.after(async () => { if (worker) await worker.stop(); if (database) await database.close(); });

async function freshUser() {
    userCounter += 1;
    const email = `mfa-${userCounter}@example.invalid`;
    const result = await database.pool.query(`INSERT INTO users(first_name,last_name,email,password_hash,email_verified_at)
        VALUES ('Mfa','Reader',$1,$2,now()) RETURNING id`, [email, await bcrypt.hash(password, 4)]);
    return { userId: result.rows[0].id, email };
}

async function freshAdminUser(index) {
    const email = ADMIN_EMAILS[index];
    const result = await database.pool.query(`INSERT INTO users(first_name,last_name,email,password_hash,email_verified_at)
        VALUES ('Mfa','Admin',$1,$2,now()) RETURNING id`, [email, await bcrypt.hash(password, 4)]);
    return { userId: result.rows[0].id, email };
}

async function request(path, { method = 'POST', cookie, token, body = {} } = {}) {
    const response = await fetch(`${worker.url}/api/auth/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Gnosis-Session': '1',
            ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: method === 'POST' ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0],
        data: text && response.status !== 204 ? JSON.parse(text) : null };
}
const get = (path, token) => request(path, { method: 'GET', token });
const login = (email, pw = password) => request('login', { body: { email, password: pw } });
async function profile(token) {
    return (await fetch(`${worker.url}/api/auth/profile`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) })).status;
}
async function enrollAndConfirm(email, userId) {
    const token = (await login(email)).data.token;
    const started = await request('mfa/enroll', { token, body: {} });
    assert.equal(started.status, 200, JSON.stringify(started.data));
    const secret = started.data.secret;
    assert.match(started.data.otpauthUrl, /^otpauth:\/\/totp\/Gnosis:/);
    // The secret is stored encrypted, never plaintext.
    const stored = await database.pool.query('SELECT secret_encrypted, enrolled FROM user_mfa WHERE user_id = $1', [userId]);
    assert.equal(stored.rows[0].enrolled, false);
    assert.ok(!stored.rows[0].secret_encrypted.includes(secret));
    assert.equal(decryptTotpSecret(stored.rows[0].secret_encrypted, Buffer.from(MFA_KEY, 'hex')), secret);
    const wrong = await request('mfa/enroll/confirm', { token, body: { code: '000000' } });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.data.code, 'INVALID_MFA_CODE');
    // A failed confirmation leaves the secret unenrolled: login is
    // still password-only.
    assert.equal((await login(email)).status, 200);
    const code = await generateTotpCode(secret);
    const confirmed = await request('mfa/enroll/confirm', { token, body: { code } });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
    assert.equal(confirmed.data.enrolled, true);
    assert.equal(confirmed.data.recoveryCodes.length, 10);
    for (const recoveryCode of confirmed.data.recoveryCodes) {
        assert.match(recoveryCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }
    return { secret, recoveryCodes: confirmed.data.recoveryCodes };
}
async function loginWithTotp(email, secret) {
    const challenged = await login(email);
    assert.equal(challenged.status, 401);
    assert.equal(challenged.data.code, 'MFA_REQUIRED');
    const code = await generateTotpCode(secret);
    const verified = await request('mfa/verify', { body: { challenge: challenged.data.challenge, code } });
    assert.equal(verified.status, 200, JSON.stringify(verified.data));
    assert.ok(verified.data.token);
    assert.ok(verified.cookie);
    return verified.data.token;
}

test('enrollment requires confirmation; an unenrolled secret cannot gate login', async () => {
    const { userId, email } = await freshUser();
    assert.deepEqual((await get('mfa/status', (await login(email)).data.token)).data, { enrolled: false });
    const { secret } = await enrollAndConfirm(email, userId);
    assert.deepEqual((await get('mfa/status', await loginWithTotp(email, secret))).data, { enrolled: true });
    // Re-enrolling an enrolled account is a 409, not a secret reset.
    const token = await loginWithTotp(email, secret);
    assert.equal((await request('mfa/enroll', { token, body: {} })).status, 409);
});

test('login returns MFA_REQUIRED; a wrong code fails and the challenge is single-use', async () => {
    const { userId, email } = await freshUser();
    const { secret, recoveryCodes } = await enrollAndConfirm(email, userId);
    const challenged = await login(email);
    assert.equal(challenged.status, 401);
    assert.equal(challenged.data.code, 'MFA_REQUIRED');
    assert.match(challenged.data.challenge, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(challenged.data.token, undefined);
    const wrong = await request('mfa/verify', { body: { challenge: challenged.data.challenge, code: '000000' } });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.data.code, 'INVALID_MFA_CODE');
    // The failed attempt did not consume the challenge: the same
    // challenge still accepts the right code.
    const token = await loginWithTotp(email, secret);
    assert.equal(await profile(token), 200);
    // ...but that challenge is now spent: replaying it fails.
    const replay = await request('mfa/verify', { body: { challenge: challenged.data.challenge, code: await generateTotpCode(secret) } });
    assert.equal(replay.status, 401);
    assert.ok(recoveryCodes.length === 10);
});

test('a recovery code works once, then never again', async () => {
    const { userId, email } = await freshUser();
    const { recoveryCodes } = await enrollAndConfirm(email, userId);
    const first = await login(email);
    const used = await request('mfa/verify', { body: { challenge: first.data.challenge, code: recoveryCodes[0] } });
    assert.equal(used.status, 200);
    assert.equal(await profile(used.data.token), 200);
    const second = await login(email);
    const replay = await request('mfa/verify', { body: { challenge: second.data.challenge, code: recoveryCodes[0] } });
    assert.equal(replay.status, 401);
    // A different unused code still works.
    const third = await login(email);
    const other = await request('mfa/verify', { body: { challenge: third.data.challenge, code: recoveryCodes[1] } });
    assert.equal(other.status, 200);
});

test('regenerating recovery codes invalidates the old set', async () => {
    const { userId, email } = await freshUser();
    const { secret, recoveryCodes } = await enrollAndConfirm(email, userId);
    const token = await loginWithTotp(email, secret);
    const wrongPassword = await request('mfa/recovery-codes/regenerate', { token, body: { password: 'wrong-password', code: await generateTotpCode(secret) } });
    assert.equal(wrongPassword.status, 401);
    const regenerated = await request('mfa/recovery-codes/regenerate', { token, body: { password, code: await generateTotpCode(secret) } });
    assert.equal(regenerated.status, 200);
    assert.equal(regenerated.data.recoveryCodes.length, 10);
    assert.ok(!regenerated.data.recoveryCodes.some((code) => recoveryCodes.includes(code)));
    // An old unused code no longer works; a new one does.
    const challenged = await login(email);
    assert.equal((await request('mfa/verify', { body: { challenge: challenged.data.challenge, code: recoveryCodes[2] } })).status, 401);
    const fresh = await request('mfa/verify', { body: { challenge: challenged.data.challenge, code: regenerated.data.recoveryCodes[0] } });
    assert.equal(fresh.status, 200);
});

test('disabling MFA requires password plus a code; login returns to password-only', async () => {
    const { userId, email } = await freshUser();
    const { secret } = await enrollAndConfirm(email, userId);
    const token = await loginWithTotp(email, secret);
    const wrongPassword = await request('mfa/disable', { token, body: { password: 'wrong-password', code: await generateTotpCode(secret) } });
    assert.equal(wrongPassword.status, 401);
    const wrongCode = await request('mfa/disable', { token, body: { password, code: '000000' } });
    assert.equal(wrongCode.status, 401);
    const disabled = await request('mfa/disable', { token, body: { password, code: await generateTotpCode(secret) } });
    assert.equal(disabled.status, 200);
    assert.deepEqual(disabled.data, { disabled: true });
    assert.deepEqual((await get('mfa/status', token)).data, { enrolled: false });
    assert.equal((await login(email)).status, 200);
});

test('disabling MFA revokes other sessions but keeps the current one', async () => {
    const { userId, email } = await freshUser();
    const { secret } = await enrollAndConfirm(email, userId);
    // Two sessions: the current one (used to disable) and another.
    const currentToken = await loginWithTotp(email, secret);
    const otherToken = await loginWithTotp(email, secret);
    assert.equal(await profile(currentToken), 200);
    assert.equal(await profile(otherToken), 200);
    const disabled = await request('mfa/disable', { token: currentToken, body: { password, code: await generateTotpCode(secret) } });
    assert.equal(disabled.status, 200);
    assert.deepEqual(disabled.data, { disabled: true });
    assert.deepEqual((await get('mfa/status', currentToken)).data, { enrolled: false });
    // The current session still works; the other session is revoked.
    // (A revoked token is rejected as TOKEN_INVALID, 403.)
    assert.equal(await profile(currentToken), 200);
    assert.equal(await profile(otherToken), 403);
    // Enrollment is cleared; exactly one session (the current one)
    // is alive and every other session for the user is revoked.
    const mfa = await database.pool.query('SELECT enrolled FROM user_mfa WHERE user_id = $1', [userId]);
    assert.equal(mfa.rows[0].enrolled, false);
    const currentSid = JSON.parse(Buffer.from(currentToken.split('.')[1], 'base64url').toString('utf8')).sid;
    const sessions = await database.pool.query('SELECT id, revoked_at FROM auth_sessions WHERE user_id = $1', [userId]);
    assert.ok(sessions.rows.length >= 2);
    for (const session of sessions.rows) {
        if (session.id === currentSid) {
            assert.equal(session.revoked_at, null);
        } else {
            assert.ok(session.revoked_at !== null, `session ${session.id} should be revoked`);
        }
    }
});

test('five wrong codes trip the per-challenge rate limit', async () => {
    const { userId, email } = await freshUser();
    await enrollAndConfirm(email, userId);
    const challenged = await login(email);
    for (let attempt = 0; attempt < 5; attempt++) {
        const wrong = await request('mfa/verify', { body: { challenge: challenged.data.challenge, code: '000000' } });
        assert.equal(wrong.status, 401, `attempt ${attempt + 1}`);
    }
    const limited = await request('mfa/verify', { body: { challenge: challenged.data.challenge, code: '000000' } });
    assert.equal(limited.status, 429);
    assert.equal(limited.data.code, 'RATE_LIMITED');
});

test('five wrong codes across fresh challenges trip the per-user rate limit', async () => {
    const { userId, email } = await freshUser();
    await enrollAndConfirm(email, userId);
    // Each login issues a fresh challenge, so the per-challenge bucket
    // never trips; only the per-IP+user bucket accumulates. Five wrong
    // codes across five challenges, then the sixth is 429.
    for (let attempt = 0; attempt < 5; attempt++) {
        const challenged = await login(email);
        assert.equal(challenged.status, 401, `login ${attempt + 1}`);
        const wrong = await request('mfa/verify', { body: { challenge: challenged.data.challenge, code: '000000' } });
        assert.equal(wrong.status, 401, `attempt ${attempt + 1}`);
    }
    const sixth = await login(email);
    assert.equal(sixth.status, 401);
    const limited = await request('mfa/verify', { body: { challenge: sixth.data.challenge, code: '000000' } });
    assert.equal(limited.status, 429);
    assert.equal(limited.data.code, 'RATE_LIMITED');
});

test('five enrollment starts trip the per-user enroll rate limit', async () => {
    const { userId, email } = await freshUser();
    const token = (await login(email)).data.token;
    for (let attempt = 0; attempt < 5; attempt++) {
        const started = await request('mfa/enroll', { token, body: {} });
        assert.equal(started.status, 200, `attempt ${attempt + 1}: ${JSON.stringify(started.data)}`);
    }
    const limited = await request('mfa/enroll', { token, body: {} });
    assert.equal(limited.status, 429);
    assert.equal(limited.data.code, 'RATE_LIMITED');
});

test('admin without MFA gets 403 MFA_ENROLLMENT_REQUIRED, enrolls with the token, then logs in via MFA', async () => {
    const { userId, email } = await freshAdminUser(0);
    // No session is issued: 403 with an enrollment token.
    const denied = await login(email);
    assert.equal(denied.status, 403, JSON.stringify(denied.data));
    assert.equal(denied.data.code, 'MFA_ENROLLMENT_REQUIRED');
    assert.match(denied.data.enrollToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const enrollToken = denied.data.enrollToken;
    // The enrollment token authorizes only enrollment: it cannot
    // read status or the profile (no session exists for it).
    assert.equal((await get('mfa/status', enrollToken)).status, 403);
    assert.equal(await profile(enrollToken), 403);
    // Enroll with the token, then confirm with a TOTP code.
    const started = await request('mfa/enroll', { token: enrollToken, body: {} });
    assert.equal(started.status, 200, JSON.stringify(started.data));
    const code = await generateTotpCode(started.data.secret);
    const confirmed = await request('mfa/enroll/confirm', { token: enrollToken, body: { code } });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
    assert.equal(confirmed.data.enrolled, true);
    assert.equal(confirmed.data.recoveryCodes.length, 10);
    // The admin now logs in via MFA normally.
    const token = await loginWithTotp(email, started.data.secret);
    assert.equal(await profile(token), 200);
    // The enrollment token is spent for enrollment: it cannot
    // re-enroll an already-enrolled account.
    assert.equal((await request('mfa/enroll', { token: enrollToken, body: {} })).status, 409);
});

test('a regular user without MFA logs in normally', async () => {
    const { userId, email } = await freshUser();
    const result = await login(email);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.ok(result.data.token);
});

test('an enrolled admin logs in via MFA normally', async () => {
    const { userId, email } = await freshAdminUser(1);
    // Enroll via the enrollment token, then the MFA login flow.
    const denied = await login(email);
    assert.equal(denied.status, 403);
    const enrollToken = denied.data.enrollToken;
    const started = await request('mfa/enroll', { token: enrollToken, body: {} });
    assert.equal(started.status, 200);
    const code = await generateTotpCode(started.data.secret);
    const confirmed = await request('mfa/enroll/confirm', { token: enrollToken, body: { code } });
    assert.equal(confirmed.status, 200);
    const token = await loginWithTotp(email, started.data.secret);
    assert.equal(await profile(token), 200);
    // The admin's enrollment is recorded in the audit log.
    const events = await database.pool.query(
        "SELECT kind FROM security_events WHERE user_id = $1 AND kind = 'mfa.enrollment_required'", [userId]);
    assert.equal(events.rows.length, 1);
});

test('an MFA login migrates a bcrypt password hash to Argon2id', async () => {
    const { userId, email } = await freshUser();
    const { secret } = await enrollAndConfirm(email, userId);
    // Rewind the account to a pre-#96 bcrypt hash (as if it enrolled
    // MFA before Argon2id existed): the next MFA login must migrate
    // it, because /mfa/verify never sees the plaintext password.
    await database.pool.query('UPDATE users SET password_hash = $1 WHERE id = $2',
        [await bcrypt.hash(password, 10), userId]);
    const before = await database.pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    assert.match(before.rows[0].password_hash, /^\$2b\$10\$/);
    const token = await loginWithTotp(email, secret);
    assert.equal(await profile(token), 200);
    const after = await database.pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    assert.match(after.rows[0].password_hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    // The migrated hash keeps working: a second MFA login succeeds
    // and leaves the hash untouched (no re-migration).
    const second = await loginWithTotp(email, secret);
    assert.equal(await profile(second), 200);
    const again = await database.pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    assert.equal(again.rows[0].password_hash, after.rows[0].password_hash);
});

test('a password change after the challenge is issued invalidates the challenge', async () => {
    const { userId, email } = await freshUser();
    const { secret } = await enrollAndConfirm(email, userId);
    const challenged = await login(email);
    assert.equal(challenged.status, 401);
    assert.equal(challenged.data.code, 'MFA_REQUIRED');
    // The password changes (reset) before MFA completes: the stored
    // hash no longer matches the one the challenge was bound to.
    const newPassword = 'synthetic-mfa-new-password';
    await database.pool.query('UPDATE users SET password_hash = $1 WHERE id = $2',
        [await hashPassword(newPassword), userId]);
    // The stale challenge is dead: even the right TOTP code fails,
    // and it cannot be retried (it was superseded on first use).
    const stale = await request('mfa/verify', { body: { challenge: challenged.data.challenge, code: await generateTotpCode(secret) } });
    assert.equal(stale.status, 401);
    assert.equal(stale.data.code, 'INVALID_MFA_CODE');
    const retry = await request('mfa/verify', { body: { challenge: challenged.data.challenge, code: await generateTotpCode(secret) } });
    assert.equal(retry.status, 401);
    assert.equal(retry.data.code, 'INVALID_MFA_CODE');
    // Login with the new password issues a fresh challenge that works.
    const fresh = await login(email, newPassword);
    assert.equal(fresh.status, 401);
    assert.equal(fresh.data.code, 'MFA_REQUIRED');
    const verified = await request('mfa/verify', { body: { challenge: fresh.data.challenge, code: await generateTotpCode(secret) } });
    assert.equal(verified.status, 200);
    assert.equal(await profile(verified.data.token), 200);
});

test('mixed key versions: a version-1 row decrypts via the previous key, a version-2 row via the current key', async () => {
    // This exercises the key ring at the service level (the worker's
    // env is fixed at startup, so the rotation is driven here with
    // the test pool). K1 is the original key (version 1); K2 is the
    // rotated key (version 2), with K1 staged as previous.
    const K1 = MFA_KEY;
    const K2 = crypto.randomBytes(32).toString('hex');
    const enrollViaService = async (email, userId) => {
        const started = await mfaService.startEnrollment(database.pool, userId, email);
        const code = await generateTotpCode(started.secret);
        const confirmed = await mfaService.confirmEnrollment(database.pool, userId, code);
        assert.equal(confirmed.ok, true);
        return started.secret;
    };
    const verifyViaService = async (userId, secret) => {
        const challenge = await mfaService.issueMfaChallenge(database.pool, userId);
        assert.ok(challenge);
        const code = await generateTotpCode(secret);
        const result = await mfaService.verifyMfaChallenge(database.pool, challenge, code);
        assert.equal(result.ok, true, JSON.stringify(result));
        return result.session;
    };
    // User A enrolls under K1 (version 1).
    process.env.MFA_ENCRYPTION_KEY = K1;
    delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;
    delete process.env.MFA_KEY_VERSION;
    const a = await freshUser();
    const secretA = await enrollViaService(a.email, a.userId);
    const rowA = await database.pool.query('SELECT key_version FROM user_mfa WHERE user_id = $1', [a.userId]);
    assert.equal(rowA.rows[0].key_version, 1);
    // Rotation: K2 becomes current (version 2), K1 becomes previous.
    // User B enrolls under K2 (version 2).
    process.env.MFA_ENCRYPTION_KEY = K2;
    process.env.MFA_ENCRYPTION_KEY_PREVIOUS = K1;
    process.env.MFA_KEY_VERSION = '2';
    const b = await freshUser();
    const secretB = await enrollViaService(b.email, b.userId);
    const rowB = await database.pool.query('SELECT key_version FROM user_mfa WHERE user_id = $1', [b.userId]);
    assert.equal(rowB.rows[0].key_version, 2);
    // Both users verify: A's version-1 secret decrypts via the
    // previous key, B's version-2 secret via the current key.
    await verifyViaService(a.userId, secretA);
    await verifyViaService(b.userId, secretB);
    // Without the previous key, A's version-1 row fails closed
    // (MfaUnavailableError) while B's version-2 row still works.
    delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;
    await assert.rejects(verifyViaService(a.userId, secretA), { name: 'MfaUnavailableError' });
    await verifyViaService(b.userId, secretB);
    // Restore the worker's key for the remaining tests.
    process.env.MFA_ENCRYPTION_KEY = MFA_KEY;
    delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;
    delete process.env.MFA_KEY_VERSION;
});
