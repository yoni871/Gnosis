const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const crypto = require("node:crypto");
const { contextFromEnvironment, createTestPool } = require("../helpers/application-database");
const { startBackend } = require("../helpers/backend-instance");
const context = contextFromEnvironment();
let database, worker;
const password = "synthetic-passkey-password";
const rpId = "frontend.example.invalid";
const origin = "https://frontend.example.invalid";

// --- Minimal CBOR encoder, only for the fixed structures below ---
// (maps, byte strings, text strings, small ints, negative ints).
function cborHead(major, value) {
    if (value < 24) return Buffer.from([(major << 5) | value]);
    if (value < 256) return Buffer.from([(major << 5) | 24, value]);
    const length = Buffer.alloc(2);
    length.writeUInt16BE(value, 0);
    return Buffer.concat([Buffer.from([(major << 5) | 25]), length]);
}
function cborInt(value) {
    return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);
}
function cborBytes(value) {
    return Buffer.concat([cborHead(2, value.length), value]);
}
function cborText(value) {
    const bytes = Buffer.from(value, "utf8");
    return Buffer.concat([cborHead(3, bytes.length), bytes]);
}
function cborValue(value) {
    if (typeof value === "number") return cborInt(value);
    if (typeof value === "string") return cborText(value);
    if (Buffer.isBuffer(value)) return cborBytes(value);
    throw new Error("Unsupported CBOR value in passkey test helper");
}
function cborMap(pairs) {
    const parts = [cborHead(5, pairs.length)];
    for (const [key, value] of pairs) parts.push(cborValue(key), cborValue(value));
    return Buffer.concat(parts);
}

// --- Synthesized WebAuthn credential ---
// A real P-256 keypair stands in for an authenticator: registration
// builds a fmt:"none" attestation and login builds a signed assertion,
// so the server's verify functions run for real — no library mocking.
function newCredential() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwk = publicKey.export({ format: "jwk" });
    return {
        id: crypto.randomBytes(16),
        publicKey,
        privateKey,
        x: Buffer.from(jwk.x, "base64url"),
        y: Buffer.from(jwk.y, "base64url"),
    };
}
function clientDataJSON(type, challenge) {
    return Buffer.from(JSON.stringify({ type, challenge, origin }), "utf8");
}
function makeRegistrationResponse(credential, challenge) {
    const rpIdHash = crypto.createHash("sha256").update(rpId).digest();
    const coseKey = cborMap([[1, 2], [3, -7], [-1, 1], [-2, credential.x], [-3, credential.y]]);
    const credentialIdLength = Buffer.alloc(2);
    credentialIdLength.writeUInt16BE(credential.id.length, 0);
    const authData = Buffer.concat([
        rpIdHash,
        Buffer.from([0x45]), // user present | user verified | attested data
        Buffer.alloc(4), // signature counter 0
        Buffer.alloc(16), // aaguid
        credentialIdLength,
        credential.id,
        coseKey,
    ]);
    // The attestation object is built by hand: attStmt is an empty
    // map value, not a byte string, so the generic encoder (which
    // would wrap a nested Buffer as bytes) is not used here.
    const attestation = Buffer.concat([
        cborHead(5, 3),
        cborText("fmt"), cborText("none"),
        cborText("attStmt"), cborHead(5, 0),
        cborText("authData"), cborBytes(authData),
    ]);
    const clientData = clientDataJSON("webauthn.create", challenge);
    return {
        id: credential.id.toString("base64url"),
        rawId: credential.id.toString("base64url"),
        type: "public-key",
        response: {
            attestationObject: attestation.toString("base64url"),
            clientDataJSON: clientData.toString("base64url"),
        },
    };
}
function makeAssertionResponse(credential, challenge, counter, userId) {
    const rpIdHash = crypto.createHash("sha256").update(rpId).digest();
    const signCount = Buffer.alloc(4);
    signCount.writeUInt32BE(counter, 0);
    const authData = Buffer.concat([rpIdHash, Buffer.from([0x05]), signCount]);
    const clientData = clientDataJSON("webauthn.get", challenge);
    const signed = Buffer.concat([authData, crypto.createHash("sha256").update(clientData).digest()]);
    const signature = crypto.sign("SHA256", signed, credential.privateKey);
    return {
        id: credential.id.toString("base64url"),
        rawId: credential.id.toString("base64url"),
        type: "public-key",
        response: {
            authenticatorData: authData.toString("base64url"),
            clientDataJSON: clientData.toString("base64url"),
            signature: signature.toString("base64url"),
            userHandle: Buffer.from(String(userId)).toString("base64url"),
        },
    };
}

test.before(async () => {
    database = await createTestPool(context);
    worker = await startBackend(context);
});
// Each test owns its account, so passkeys registered in one test
// can never satisfy (or block) another test's login.
async function createUser(suffix) {
    const address = `passkeys-${suffix}@example.invalid`;
    const result = await database.pool.query(`INSERT INTO users(first_name,last_name,email,password_hash,email_verified_at)
        VALUES ('Passkey','Reader',$1,$2,now()) RETURNING id`, [address, await bcrypt.hash(password, 4)]);
    return { id: result.rows[0].id, email: address };
}
test.beforeEach(async () => { await database.pool.query("DELETE FROM rate_limit_attempts"); });
test.after(async () => { if (worker) await worker.stop(); if (database) await database.close(); });

async function post(path, token, body = {}) {
    const response = await fetch(`${worker.url}/api/auth/${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Gnosis-Session": "1",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    return {
        status: response.status,
        cookie: response.headers.get("set-cookie")?.split(";")[0],
        data: text ? JSON.parse(text) : null,
    };
}
async function get(path, token) {
    const response = await fetch(`${worker.url}/api/auth/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
}
const login = (emailAddress, pass = password) =>
    post("login", null, { email: emailAddress, password: pass });
async function profile(token) {
    return (await get("profile", token)).status;
}
async function registerCredential(account, label, credential) {
    const session = await login(account.email);
    assert.equal(session.status, 200);
    const options = await post("passkeys/register/options", session.data.token, { password });
    assert.equal(options.status, 200);
    assert.equal(options.data.rp.id, rpId);
    assert.equal(options.data.challenge.length > 0, true);
    const response = makeRegistrationResponse(credential, options.data.challenge);
    const verified = await post("passkeys/register/verify", session.data.token,
        { label, response });
    assert.equal(verified.status, 201, JSON.stringify(verified.data));
    return verified.data;
}
async function loginWithPasskey(account, credential, counter) {
    const options = await post("passkeys/login/options", null, { email: account.email });
    assert.equal(options.status, 200);
    const response = makeAssertionResponse(credential, options.data.challenge, counter, account.id);
    return post("passkeys/login/verify", null, { response });
}

test("registration requires auth and the current password, then stores a passkey", async () => {
    const account = await createUser("register");
    assert.equal((await post("passkeys/register/options", null, { password })).status, 401);
    const session = await login(account.email);
    assert.equal(session.status, 200);
    assert.equal((await post("passkeys/register/options", session.data.token,
        { password: "wrong-password" })).status, 401);
    const credential = newCredential();
    const stored = await registerCredential(account, "MacBook", credential);
    assert.equal(stored.label, "MacBook");
    assert.equal(stored.publicKey, undefined);
    assert.equal(stored.credentialId, undefined);
    const listed = await get("passkeys", session.data.token);
    assert.equal(listed.status, 200);
    assert.equal(listed.data.passkeys.length, 1);
    assert.equal(listed.data.passkeys[0].label, "MacBook");
    assert.equal(listed.data.passkeys[0].flaggedAt, null);
});

test("passkey login issues a working session with no extra step", async () => {
    const account = await createUser("login");
    const credential = newCredential();
    await registerCredential(account, "MacBook", credential);
    // At this base there is no TOTP yet: a passkey login returns a
    // working session directly. The PR #93 (TOTP) rebase adds the
    // assertion that no MFA_REQUIRED step intervenes here — a passkey
    // is the phishing-resistant second factor, so none is stacked on.
    const loggedIn = await loginWithPasskey(account, credential, 1);
    assert.equal(loggedIn.status, 200, JSON.stringify(loggedIn.data));
    assert.ok(loggedIn.data.token);
    assert.ok(loggedIn.cookie);
    assert.equal(await profile(loggedIn.data.token), 200);
});

test("login options are indistinguishable for unknown emails and accounts without passkeys", async () => {
    const unknown = await post("passkeys/login/options", null, { email: "nobody@example.invalid" });
    assert.equal(unknown.status, 401);
    assert.deepEqual(unknown.data, { error: "Invalid email or password.", code: "INVALID_CREDENTIALS" });
    const bare = await createUser("bare");
    const none = await post("passkeys/login/options", null, { email: bare.email });
    assert.equal(none.status, 401);
    assert.deepEqual(none.data, unknown.data);
});

test("a regressed counter flags the credential and the password still works", async () => {
    const account = await createUser("counter");
    const credential = newCredential();
    const stored = await registerCredential(account, "Second device", credential);
    const first = await loginWithPasskey(account, credential, 1);
    assert.equal(first.status, 200);
    // Same counter again: a replay / possible clone. Rejected, and
    // the credential is flagged in the database.
    const replay = await loginWithPasskey(account, credential, 1);
    assert.equal(replay.status, 401);
    assert.deepEqual(replay.data, { error: "Invalid email or password.", code: "INVALID_CREDENTIALS" });
    const flagged = await database.pool.query(
        "SELECT flagged_at FROM user_passkeys WHERE id = $1", [stored.id]);
    assert.ok(flagged.rows[0].flagged_at);
    // Even a forward counter cannot revive a flagged credential.
    const forward = await loginWithPasskey(account, credential, 2);
    assert.equal(forward.status, 401);
    // The flagged credential can be removed with the password, and
    // the account is not stranded: password login still works.
    const session = await login(account.email);
    assert.equal(session.status, 200);
    const removed = await fetch(`${worker.url}/api/auth/passkeys/${stored.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.token}` },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(10000),
    });
    assert.equal(removed.status, 204);
    assert.equal((await login(account.email)).status, 200);
});

test("rename and remove work, and removal ends passkey login but not password login", async () => {
    const account = await createUser("manage");
    const credential = newCredential();
    const stored = await registerCredential(account, "Work laptop", credential);
    const session = await login(account.email);
    const renamed = await fetch(`${worker.url}/api/auth/passkeys/${stored.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.token}` },
        body: JSON.stringify({ label: "Home laptop" }),
        signal: AbortSignal.timeout(10000),
    });
    assert.equal(renamed.status, 200);
    assert.equal((await renamed.json()).label, "Home laptop");
    const badDelete = await fetch(`${worker.url}/api/auth/passkeys/${stored.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.token}` },
        body: JSON.stringify({ password: "wrong-password" }),
        signal: AbortSignal.timeout(10000),
    });
    assert.equal(badDelete.status, 401);
    const removed = await fetch(`${worker.url}/api/auth/passkeys/${stored.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.token}` },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(10000),
    });
    assert.equal(removed.status, 204);
    assert.equal((await post("passkeys/login/options", null, { email: account.email })).status, 401);
    assert.equal((await login(account.email)).status, 200);
});
