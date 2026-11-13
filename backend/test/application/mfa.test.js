const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const { contextFromEnvironment, createTestPool } = require('../helpers/application-database');
const { startBackend } = require('../helpers/backend-instance');
const { generateTotpCode } = require('../../src/utils/mfaTotp');
const { decryptTotpSecret } = require('../../src/utils/mfaCrypto');
const { hashPassword } = require('../../src/utils/passwordHash');
const { computeKeyHash } = require('../../src/utils/rateLimit');
const mfaService = require('../../src/services/mfaService');

// The rate-limit secret the disposable worker uses (backend-instance).
const RATE_LIMIT_SECRET = 'synthetic-application-test-rate-limit';

// Synthetic encryption key for the disposable worker only. The test
// file sets it before startBackend, and backend-instance forwards it
// to the worker (test isolation only) — mirroring the Resend stub
// override. The key never leaves this disposable run.
const MFA_KEY = crypto.randomBytes(32).toString('hex');
process.env.MFA_ENCRYPTION_KEY = MFA_KEY;
// Admin-mandatory MFA (design §9): these synthetic admin emails are
// forwarded to the worker the same way, so the login gate can be
// exercised. The admin users are created by the tests below.
const ADMIN_EMAILS = ['mfa-admin-1@example.invalid', 'mfa-admin-2@example.invalid', 'mfa-admin-3@example.invalid', 'mfa-admin-4@example.invalid'];
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
    const hash = await bcrypt.hash(password, 4);
    const result = await database.pool.query(`INSERT INTO users(first_name,last_name,email,password_hash,email_verified_at)
        VALUES ('Mfa','Reader',$1,$2,now()) RETURNING id`, [email, hash]);
    return { userId: result.rows[0].id, email, passwordHash: hash };
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
    // TOTP step burning (F6) makes a code's 30-second step single-use
    // per account, so two logins back-to-back cannot share a code.
    // If the first code is rejected because its step was already
    // burned (e.g. a prior login in the same step), wait for the
    // step to advance and retry once with a fresh code. A genuinely
    // wrong code still fails (the retry uses a fresh, correct code).
    for (let attempt = 0; attempt < 2; attempt++) {
        const challenged = await login(email);
        assert.equal(challenged.status, 401);
        assert.equal(challenged.data.code, 'MFA_REQUIRED');
        const code = await generateTotpCode(secret);
        const verified = await request('mfa/verify', { body: { challenge: challenged.data.challenge, code } });
        if (verified.status === 200) {
            assert.ok(verified.data.token);
            assert.ok(verified.cookie);
            return verified.data.token;
        }
        // A 401 here is a burned step (the code was correct for the
        // current step but already used). Wait for the step to roll
        // over, then retry with a fresh code.
        assert.equal(verified.status, 401, JSON.stringify(verified.data));
        const stepAt = () => Math.floor(Date.now() / 1000 / 30);
        const burnedStep = stepAt();
        while (stepAt() === burnedStep) {
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }
    throw new Error('loginWithTotp: retry after step rollover also failed');
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
    // re-enroll an already-enrolled account. It returns 403 (the
    // token was bound to the pre-migration bcrypt hash, and the MFA
    // login above migrated the password to Argon2id, invalidating
    // it) or 409 (already enrolled) — either way, no re-enrollment.
    const reenroll = await request('mfa/enroll', { token: enrollToken, body: {} });
    assert.ok(reenroll.status === 403 || reenroll.status === 409, JSON.stringify(reenroll.data));
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
        assert.equal(started.ok, true, JSON.stringify(started));
        const code = await generateTotpCode(started.secret);
        const confirmed = await mfaService.confirmEnrollment(database.pool, userId, code);
        assert.equal(confirmed.ok, true);
        return started.secret;
    };
    const verifyViaService = async (userId, secret, passwordHash) => {
        // TOTP step burning (F6): a code's step is single-use, so a
        // second verify in the same step must wait for the step to
        // roll over and retry with a fresh code.
        for (let attempt = 0; attempt < 2; attempt++) {
            const challenge = await mfaService.issueMfaChallenge(database.pool, userId, passwordHash);
            assert.ok(challenge);
            const code = await generateTotpCode(secret);
            const result = await mfaService.verifyMfaChallenge(database.pool, challenge, code);
            if (result.ok) {
                return result.session;
            }
            const stepAt = () => Math.floor(Date.now() / 1000 / 30);
            const burnedStep = stepAt();
            while (stepAt() === burnedStep) {
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        }
        throw new Error('verifyViaService: retry after step rollover also failed');
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
    await verifyViaService(a.userId, secretA, a.passwordHash);
    await verifyViaService(b.userId, secretB, b.passwordHash);
    // Without the previous key, A's version-1 row fails closed
    // (MfaUnavailableError) while B's version-2 row still works.
    delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;
    await assert.rejects(verifyViaService(a.userId, secretA, a.passwordHash), { name: "MfaUnavailableError" });
    await verifyViaService(b.userId, secretB, b.passwordHash);
    // Restore the worker's key for the remaining tests.
    process.env.MFA_ENCRYPTION_KEY = MFA_KEY;
    delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;
    delete process.env.MFA_KEY_VERSION;
});

// ---- Codex review regression tests (PR #93, findings F1–F7) ----

test('F1: challenge issuance refuses a stale verified password hash', async () => {
    // issueMfaChallenge is given the hash login verified. If that
    // hash no longer matches the account's current credential (a
    // reset landed between verification and issuance), no challenge
    // is issued — a challenge must never be minted for a password
    // that has since been reset.
    const { userId, email } = await freshUser();
    await enrollAndConfirm(email, userId);
    // Re-read the current hash: the enrollment login migrated the
    // bcrypt hash to Argon2id, so the hash freshUser returned is
    // stale by now.
    const current = await database.pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    const passwordHash = current.rows[0].password_hash;
    // The current hash issues a challenge.
    const live = await mfaService.issueMfaChallenge(database.pool, userId, passwordHash);
    assert.ok(typeof live === 'string' && live.length > 0);
    // A stale hash (not the current credential) issues nothing.
    const stale = await mfaService.issueMfaChallenge(database.pool, userId, 'synthetic-stale-hash');
    assert.equal(stale, null);
    // The live challenge still works (the stale attempt superseded
    // nothing — it never issued).
    const { secret } = await database.pool.query('SELECT secret_encrypted FROM user_mfa WHERE user_id = $1', [userId])
        .then((r) => ({ secret: decryptTotpSecret(r.rows[0].secret_encrypted, Buffer.from(MFA_KEY, 'hex')) }));
    const result = await mfaService.verifyMfaChallenge(database.pool, live, await generateTotpCode(secret));
    assert.equal(result.ok, true, JSON.stringify(result));
});

test('F2: concurrent enrollment starts never reset an enrolled factor', async () => {
    const { userId, email } = await freshUser();
    await enrollAndConfirm(email, userId);
    // Two concurrent starts against an already-enrolled account:
    // both must refuse (already-enrolled) and the factor must stay
    // enrolled. A start must never silently flip enrolled to false.
    const [first, second] = await Promise.all([
        mfaService.startEnrollment(database.pool, userId, email),
        mfaService.startEnrollment(database.pool, userId, email),
    ]);
    assert.deepEqual(first, { ok: false, reason: 'already-enrolled' });
    assert.deepEqual(second, { ok: false, reason: 'already-enrolled' });
    const row = await database.pool.query('SELECT enrolled FROM user_mfa WHERE user_id = $1', [userId]);
    assert.equal(row.rows[0].enrolled, true);
    // The route surfaces the same refusal as a 409.
    const secretRow = await database.pool.query('SELECT secret_encrypted FROM user_mfa WHERE user_id = $1', [userId]);
    const secret = decryptTotpSecret(secretRow.rows[0].secret_encrypted, Buffer.from(MFA_KEY, 'hex'));
    const token = await loginWithTotp(email, secret);
    assert.equal((await request('mfa/enroll', { token, body: {} })).status, 409);
});

test('F3: an admin cannot disable MFA, and a session without MFA is refused', async () => {
    const { userId, email } = await freshAdminUser(2);
    // Enroll the admin via the enrollment token.
    const denied = await login(email);
    assert.equal(denied.status, 403);
    const started = await request('mfa/enroll', { token: denied.data.enrollToken, body: {} });
    assert.equal(started.status, 200);
    const secret = started.data.secret;
    const confirmed = await request('mfa/enroll/confirm', { token: denied.data.enrollToken, body: { code: await generateTotpCode(secret) } });
    assert.equal(confirmed.status, 200);
    const token = await loginWithTotp(email, secret);
    assert.equal(await profile(token), 200);
    // Disable is forbidden for an admin, even with a valid password
    // and code: 403, and the factor stays enrolled.
    const disabled = await request('mfa/disable', { token, body: { password, code: await generateTotpCode(secret) } });
    assert.equal(disabled.status, 403, JSON.stringify(disabled.data));
    assert.equal(disabled.data.code, 'MFA_REQUIRED');
    const row = await database.pool.query('SELECT enrolled FROM user_mfa WHERE user_id = $1', [userId]);
    assert.equal(row.rows[0].enrolled, true);
    // If the factor is removed by any other path, the existing
    // session is refused: admin MFA is enforced throughout
    // authenticated session use, not only at login.
    await database.pool.query("UPDATE user_mfa SET enrolled = FALSE WHERE user_id = $1", [userId]);
    assert.equal(await profile(token), 403);
});

test('F4: the per-account verify limit is shared across IPs and fresh challenges', async () => {
    const { userId, email } = await freshUser();
    await enrollAndConfirm(email, userId);
    // Five wrong codes, each with a fresh challenge (so the
    // per-challenge bucket never trips). The IP-independent
    // per-account bucket (mfa_verify_user, keyed by user id only)
    // must accumulate all five — distributed guessing from many
    // source addresses cannot open a fresh bucket.
    for (let attempt = 0; attempt < 5; attempt++) {
        const challenged = await login(email);
        assert.equal(challenged.status, 401, `login ${attempt + 1}`);
        const wrong = await request('mfa/verify', { body: { challenge: challenged.data.challenge, code: '000000' } });
        assert.equal(wrong.status, 401, `attempt ${attempt + 1}`);
    }
    const keyHash = computeKeyHash('mfa_verify_user', [String(userId)], RATE_LIMIT_SECRET);
    const counted = await database.pool.query(
        "SELECT count(*)::int AS n FROM rate_limit_attempts WHERE key_hash = $1 AND policy = 'mfa_verify_user' AND attempted_at > now() - INTERVAL '15 minutes'",
        [keyHash]);
    assert.equal(counted.rows[0].n, 5, 'the IP-independent per-account bucket must hold all five attempts');
    const sixth = await login(email);
    assert.equal(sixth.status, 401);
    const limited = await request('mfa/verify', { body: { challenge: sixth.data.challenge, code: '000000' } });
    assert.equal(limited.status, 429);
    assert.equal(limited.data.code, 'RATE_LIMITED');
});

test('F5: two concurrent disables with one recovery code — only one succeeds', async () => {
    const { userId, email } = await freshUser();
    const { secret, recoveryCodes } = await enrollAndConfirm(email, userId);
    const token = await loginWithTotp(email, secret);
    const code = recoveryCodes[0];
    // Two concurrent disables, both authorized by the same recovery
    // code. The code is single-use: the first disable consumes it,
    // the second must fail (its in-transaction recheck finds the
    // code already used), and MFA must end up disabled exactly once.
    const [first, second] = await Promise.all([
        request('mfa/disable', { token, body: { password, code } }),
        request('mfa/disable', { token, body: { password, code } }),
    ]);
    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [200, 401], JSON.stringify([first.data, second.data]));
    const row = await database.pool.query('SELECT enrolled FROM user_mfa WHERE user_id = $1', [userId]);
    assert.equal(row.rows[0].enrolled, false);
});

test('F6: a TOTP code cannot be replayed with a fresh challenge', async () => {
    const { userId, email } = await freshUser();
    const { secret } = await enrollAndConfirm(email, userId);
    // First login consumes the code's time step.
    const first = await login(email);
    assert.equal(first.status, 401);
    const code = await generateTotpCode(secret);
    const verified = await request('mfa/verify', { body: { challenge: first.data.challenge, code } });
    assert.equal(verified.status, 200);
    // A fresh challenge (a second login) within the same 30-second
    // window: the same code is a replay and must fail, even though
    // it is still a valid code for the current time step.
    const second = await login(email);
    assert.equal(second.status, 401);
    assert.equal(second.data.code, 'MFA_REQUIRED');
    const replay = await request('mfa/verify', { body: { challenge: second.data.challenge, code } });
    assert.equal(replay.status, 401);
    assert.equal(replay.data.code, 'INVALID_MFA_CODE');
    // A genuinely new code (next step) still works. Wait for the
    // time step to advance so the fresh code is from an unburned
    // step (at most one 30-second period).
    const stepAt = () => Math.floor(Date.now() / 1000 / 30);
    const burnedStep = stepAt();
    while (stepAt() === burnedStep) {
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const fresh = await login(email);
    const nextCode = await generateTotpCode(secret);
    const ok = await request('mfa/verify', { body: { challenge: fresh.data.challenge, code: nextCode } });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
});

test('F7: a password reset invalidates an admin enrollment token', async () => {
    const { userId, email } = await freshAdminUser(3);
    // The admin logs in and receives an enrollment token bound to
    // the credential login verified.
    const denied = await login(email);
    assert.equal(denied.status, 403);
    const enrollToken = denied.data.enrollToken;
    // The token works before any credential change.
    assert.equal((await request('mfa/enroll', { token: enrollToken, body: {} })).status, 200);
    // The password is reset (or changed) after the token was issued.
    const newPassword = 'synthetic-mfa-admin-new-password';
    await database.pool.query('UPDATE users SET password_hash = $1 WHERE id = $2',
        [await hashPassword(newPassword), userId]);
    // The pre-reset token is now dead: it cannot enroll MFA for the
    // new credential.
    assert.equal((await request('mfa/enroll', { token: enrollToken, body: {} })).status, 403);
    // A fresh login (new password) issues a new token that works.
    const fresh = await login(email, newPassword);
    assert.equal(fresh.status, 403);
    assert.equal(fresh.data.code, 'MFA_ENROLLMENT_REQUIRED');
    assert.equal((await request('mfa/enroll', { token: fresh.data.enrollToken, body: {} })).status, 200);
});
