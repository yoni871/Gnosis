const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Explicit isolation also protects direct node --test invocations.
process.env.GNOSIS_TEST_ISOLATION = "1";
process.env.JWT_SECRET = "synthetic-test-jwt-secret";
process.env.RATE_LIMIT_KEY_SECRET = "synthetic-test-rate-limit-secret";
process.env.RESEND_API_KEY = "re_synthetic";
process.env.EMAIL_FROM = "Gnosis Test <test@example.invalid>";
process.env.FRONTEND_URL = "https://frontend.example.invalid";

const app = require("../../src/app");
const pool = require("../../src/db/db");
const webauthn = require("../../src/utils/webauthn");
const passkeys = require("../../src/services/passkeyService");
const { validatePasskeyLabel } = require("../../src/utils/authValidation");

const user = {
    id: 11,
    first_name: "Passkey",
    last_name: "Reader",
    email: "passkeys@example.invalid",
    password_hash: null, // set in test.before to a cost-4 hash of the password below
};
const userPassword = "synthetic-password";
const token = jwt.sign({ userId: user.id, sid: "00000000-0000-0000-0000-000000000011" },
    process.env.JWT_SECRET, { algorithm: "HS256", issuer: "gnosis", audience: "gnosis-api" });

// The mocked pool answers by SQL shape, like the password-reset route
// tests. Anything unrecognised throws, so a route reaching a query
// the test did not plan for fails loudly instead of silently passing.
let behavior = () => { throw new Error("Unexpected database query in passkey unit test"); };
const queryMock = test.mock.method(pool, "query", async (...args) => behavior(...args));
const connectMock = test.mock.method(pool, "connect", async () => {
    throw Object.assign(new Error("Synthetic database failure"), { code: "ECONNREFUSED" });
});

let server;
let baseUrl;

test.before(async () => {
    user.password_hash = await bcrypt.hash(userPassword, 4);
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    queryMock.mock.restore();
    connectMock.mock.restore();
    await pool.end();
});

test.beforeEach(() => {
    behavior = () => { throw new Error("Unexpected database query in passkey unit test"); };
});

async function request(path, options = {}) {
    const { headers, ...rest } = options;
    const response = await fetch(`${baseUrl}${path}`, {
        ...rest,
        headers: { Connection: "close", ...headers },
    });
    const text = await response.text();
    return { response, text, json: text ? JSON.parse(text) : null };
}

function sessionRow() {
    return { rows: [{ id: "00000000-0000-0000-0000-000000000011" }] };
}
function userRow() {
    return { rows: [user] };
}
function authBehavior(sql) {
    if (/FROM auth_sessions/.test(sql)) return sessionRow();
    if (/FROM users WHERE id/.test(sql)) return userRow();
    throw new Error(`Unexpected query: ${sql}`);
}

function clientData(challenge, type = "webauthn.create") {
    return Buffer.from(JSON.stringify({
        type, challenge, origin: "https://frontend.example.invalid",
    })).toString("base64url");
}

// --- Relying-party derivation ---

test("relying-party ID comes from FRONTEND_URL, never a hardcoded domain", () => {
    const original = process.env.FRONTEND_URL;
    try {
        process.env.FRONTEND_URL = "https://studygnosis.com";
        assert.deepEqual(webauthn.relyingParty(), {
            rpName: "Gnosis", rpId: "studygnosis.com", origin: "https://studygnosis.com",
        });
        process.env.FRONTEND_URL = "http://localhost:5173";
        assert.deepEqual(webauthn.relyingParty(), {
            rpName: "Gnosis", rpId: "localhost", origin: "http://localhost:5173",
        });
        process.env.FRONTEND_URL = "https://gnosis-git-main-gnosis9.vercel.app";
        assert.equal(webauthn.relyingParty().rpId, "gnosis-git-main-gnosis9.vercel.app");
    } finally {
        process.env.FRONTEND_URL = original;
    }
});

test("user handles round-trip to the user id and reject anything else", () => {
    assert.equal(Buffer.from(webauthn.userHandle(11)).toString("utf8"), "11");
    assert.equal(webauthn.userHandleMatches(Buffer.from("11").toString("base64url"), 11), true);
    assert.equal(webauthn.userHandleMatches(Buffer.from("12").toString("base64url"), 11), false);
    assert.equal(webauthn.userHandleMatches("", 11), false);
    assert.equal(webauthn.userHandleMatches("!!!not-base64url!!!", 11), false);
});

// --- Challenge lifecycle (mocked pool) ---

test("challenges are single-use: the second consume loses", async () => {
    let claimed = 0;
    behavior = async (sql) => {
        if (/DELETE FROM webauthn_challenges/.test(sql)) return { rows: [] };
        if (/INSERT INTO webauthn_challenges/.test(sql)) return { rows: [] };
        if (/UPDATE webauthn_challenges SET used_at/.test(sql)) {
            return { rows: claimed++ === 0 ? [{ id: "challenge-row" }] : [] };
        }
        throw new Error(`Unexpected query: ${sql}`);
    };
    const challenge = await webauthn.createChallenge(user.id, "registration");
    assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(await webauthn.consumeChallenge(user.id, "registration", challenge), true);
    assert.equal(await webauthn.consumeChallenge(user.id, "registration", challenge), false);
    assert.equal(await webauthn.consumeChallenge(user.id, "registration", ""), false);
    assert.equal(await webauthn.consumeChallenge(user.id, "authentication", challenge), false);
});

// --- Counter policy ---

test("counter policy: forward is ok, zero is unsupported, regression is a regression", () => {
    assert.equal(passkeys.counterOutcome(0, 0), "ignore");
    assert.equal(passkeys.counterOutcome(0, 1), "ok");
    assert.equal(passkeys.counterOutcome(5, 6), "ok");
    assert.equal(passkeys.counterOutcome(5, 5), "regression");
    assert.equal(passkeys.counterOutcome(5, 3), "regression");
    assert.equal(passkeys.counterOutcome(5, 0), "ignore");
    assert.equal(passkeys.counterOutcome(0, 0), "ignore");
});

// --- Label validation ---

test("passkey labels are trimmed and bounded like names", () => {
    assert.deepEqual(validatePasskeyLabel("  MacBook  "), { value: "MacBook" });
    assert.equal(validatePasskeyLabel("").error, "Passkey name is required.");
    assert.equal(validatePasskeyLabel("x".repeat(101)).error,
        "Passkey name must be at most 100 characters.");
});

// --- Registration ceremony (mocked verification) ---

test("registration options require authentication", async () => {
    const result = await request("/api/auth/passkeys/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "synthetic-password" }),
    });
    assert.equal(result.response.status, 401);
    assert.deepEqual(result.json, { error: "Access token required.", code: "TOKEN_REQUIRED" });
});

test("registration options reject a wrong password with the login body", async () => {
    behavior = authBehavior;
    const result = await request("/api/auth/passkeys/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: "wrong-password" }),
    });
    assert.equal(result.response.status, 401);
    assert.deepEqual(result.json, {
        error: "Invalid email or password.", code: "INVALID_CREDENTIALS",
    });
});

test("registration options return the stored challenge verbatim", async () => {
    // The browser signs the challenge from the options JSON, and the
    // server later matches it against the stored base64url value: the
    // two must be the same string. (SimpleWebAuthn treats a string
    // challenge as raw text and re-encodes it, so the route passes
    // challenge bytes and the JSON carries the base64url form.)
    let storedChallenge;
    behavior = async (sql, params) => {
        if (/FROM auth_sessions/.test(sql)) return sessionRow();
        if (/FROM users WHERE id/.test(sql)) return userRow();
        if (/COUNT\(\*\)::int AS count FROM user_passkeys/.test(sql)) return { rows: [{ count: 0 }] };
        if (/FROM user_passkeys WHERE user_id/.test(sql)) return { rows: [] };
        if (/DELETE FROM webauthn_challenges/.test(sql)) return { rows: [] };
        if (/INSERT INTO webauthn_challenges/.test(sql)) {
            storedChallenge = params[2];
            return { rows: [] };
        }
        throw new Error(`Unexpected query: ${sql}`);
    };
    const result = await request("/api/auth/passkeys/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: "synthetic-password" }),
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.challenge, storedChallenge);
    assert.equal(result.json.rp.id, "frontend.example.invalid");
    assert.deepEqual(result.json.excludeCredentials, []);
});

test("registration verify with an unknown challenge fails before verification runs", async () => {
    const verifyMock = test.mock.method(webauthn, "verifyRegistration",
        async () => ({ verified: true, registrationInfo: {} }));
    behavior = async (sql) => {
        if (/FROM auth_sessions/.test(sql)) return sessionRow();
        if (/FROM users WHERE id/.test(sql)) return userRow();
        if (/UPDATE webauthn_challenges SET used_at/.test(sql)) return { rows: [] };
        throw new Error(`Unexpected query: ${sql}`);
    };
    const result = await request("/api/auth/passkeys/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            label: "MacBook",
            response: {
                id: "credential-id",
                rawId: "credential-id",
                type: "public-key",
                response: {
                    attestationObject: "dGVzdA",
                    clientDataJSON: clientData("AAAA"),
                },
            },
        }),
    });
    assert.equal(result.response.status, 400);
    assert.deepEqual(result.json, {
        error: "Invalid or expired passkey challenge.", code: "PASSKEY_CHALLENGE_INVALID",
    });
    assert.equal(verifyMock.mock.calls.length, 0);
});

test("registration verify stores the credential and returns no key material", async () => {
    const challenge = "BBBB";
    const verifyMock = test.mock.method(webauthn, "verifyRegistration",
        async () => ({
            verified: true,
            registrationInfo: {
                credential: {
                    id: "Y3JlZGVudGlhbC1pZA",
                    publicKey: new Uint8Array([1, 2, 3, 4]),
                    counter: 0,
                    transports: ["internal"],
                },
                credentialBackedUp: true,
            },
        }));
    let inserted;
    behavior = async (sql, params) => {
        if (/FROM auth_sessions/.test(sql)) return sessionRow();
        if (/FROM users WHERE id/.test(sql)) return userRow();
        if (/UPDATE webauthn_challenges SET used_at/.test(sql)) return { rows: [{ id: "c1" }] };
        if (/INSERT INTO user_passkeys/.test(sql)) {
            inserted = params;
            return { rows: [{
                id: "00000000-0000-0000-0000-000000000021", user_id: user.id,
                credential_id: "Y3JlZGVudGlhbC1pZA", counter: 0, transports: ["internal"],
                backed_up: true, label: "MacBook", created_at: new Date().toISOString(),
                last_used_at: null, flagged_at: null,
            }] };
        }
        throw new Error(`Unexpected query: ${sql}`);
    };
    const result = await request("/api/auth/passkeys/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            label: "MacBook",
            response: {
                id: "Y3JlZGVudGlhbC1pZA",
                rawId: "Y3JlZGVudGlhbC1pZA",
                type: "public-key",
                response: {
                    attestationObject: "dGVzdA",
                    clientDataJSON: clientData(challenge),
                },
            },
        }),
    });
    assert.equal(result.response.status, 201);
    assert.equal(verifyMock.mock.calls.length, 1);
    assert.equal(result.json.id, "00000000-0000-0000-0000-000000000021");
    assert.equal(result.json.label, "MacBook");
    assert.equal(result.json.publicKey, undefined);
    assert.equal(result.json.credentialId, undefined);
    assert.equal(inserted[1], "Y3JlZGVudGlhbC1pZA");
    assert.equal(inserted[2], Buffer.from([1, 2, 3, 4]).toString("base64url"));
    assert.equal(inserted[5], true);
});

// --- Management endpoints (mocked pool, no ceremony) ---

test("list returns labels and dates only, never key material", async () => {
    behavior = async (sql) => {
        if (/FROM auth_sessions/.test(sql)) return sessionRow();
        if (/FROM user_passkeys WHERE user_id/.test(sql)) {
            return { rows: [{
                id: "00000000-0000-0000-0000-000000000021", user_id: user.id,
                credential_id: "Y3JlZGVudGlhbC1pZA", counter: 3, transports: ["internal"],
                backed_up: true, label: "MacBook", created_at: new Date().toISOString(),
                last_used_at: null, flagged_at: null,
            }] };
        }
        throw new Error(`Unexpected query: ${sql}`);
    };
    const result = await request("/api/auth/passkeys", {
        headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.json.passkeys.length, 1);
    assert.equal(result.json.passkeys[0].label, "MacBook");
    assert.equal(result.json.passkeys[0].credentialId, undefined);
    assert.equal(result.json.passkeys[0].publicKey, undefined);
    assert.equal(result.response.headers.get("cache-control"), "no-store");
});

test("rename rejects an overlong label and renames a known passkey", async () => {
    behavior = authBehavior;
    const bad = await request("/api/auth/passkeys/00000000-0000-0000-0000-000000000021", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: "x".repeat(101) }),
    });
    assert.equal(bad.response.status, 400);
    assert.equal(bad.json.code, "VALIDATION_FAILED");

    behavior = async (sql) => {
        if (/FROM auth_sessions/.test(sql)) return sessionRow();
        if (/UPDATE user_passkeys SET label/.test(sql)) {
            return { rows: [{
                id: "00000000-0000-0000-0000-000000000021", user_id: user.id,
                credential_id: "Y3JlZGVudGlhbC1pZA", counter: 3, transports: ["internal"],
                backed_up: true, label: "Work laptop", created_at: new Date().toISOString(),
                last_used_at: null, flagged_at: null,
            }] };
        }
        throw new Error(`Unexpected query: ${sql}`);
    };
    const renamed = await request("/api/auth/passkeys/00000000-0000-0000-0000-000000000021", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: "Work laptop" }),
    });
    assert.equal(renamed.response.status, 200);
    assert.equal(renamed.json.label, "Work laptop");
});

test("remove requires the current password and returns 204", async () => {
    behavior = async (sql) => {
        if (/FROM auth_sessions/.test(sql)) return sessionRow();
        if (/FROM users WHERE id/.test(sql)) return userRow();
        if (/DELETE FROM user_passkeys/.test(sql)) return { rowCount: 1 };
        throw new Error(`Unexpected query: ${sql}`);
    };
    const result = await request("/api/auth/passkeys/00000000-0000-0000-0000-000000000021", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        // The stored hash is a cost-4 hash of "synthetic-password",
        // set in test.before; only that password verifies.
        body: JSON.stringify({ password: "synthetic-password" }),
    });
    assert.equal(result.response.status, 204);
});
