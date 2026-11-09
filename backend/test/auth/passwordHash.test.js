const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const {
    ARGON2_OPTIONS,
    UNKNOWN_PASSWORD_HASH,
    hashPassword,
    verifyPassword,
    isArgon2idHash,
    isBcryptHash,
} = require("../../src/utils/passwordHash");

const PASSWORD = "correct horse battery staple";

test("hashPassword produces an Argon2id hash with the OWASP parameters", async () => {
    const hash = await hashPassword(PASSWORD);
    assert.match(hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    assert.equal(ARGON2_OPTIONS.type, 2, "argon2.argon2id");
    assert.equal(ARGON2_OPTIONS.memoryCost, 19456, "19 MiB");
    assert.equal(ARGON2_OPTIONS.timeCost, 2);
    assert.equal(ARGON2_OPTIONS.parallelism, 1);
    assert.equal(await verifyPassword(PASSWORD, hash), true);
    assert.equal(await verifyPassword("wrong password", hash), false);
    assert.notEqual(hash, PASSWORD, "never store the password itself");
});

test("verifyPassword accepts bcrypt cost-10 and cost-12 hashes", async () => {
    for (const cost of [10, 12]) {
        const hash = await bcrypt.hash(PASSWORD, cost);
        assert.equal(isBcryptHash(hash), true);
        assert.equal(isArgon2idHash(hash), false);
        assert.equal(await verifyPassword(PASSWORD, hash), true);
        assert.equal(await verifyPassword("wrong password", hash), false);
    }
});

test("verifyPassword fails closed for a stored value in neither format", async () => {
    for (const stored of ["synthetic-hash", "scrypt:...", "", null, undefined, 42, {}]) {
        assert.equal(await verifyPassword(PASSWORD, stored), false);
    }
    assert.equal(isArgon2idHash("synthetic-hash"), false);
    assert.equal(isBcryptHash("synthetic-hash"), false);
});

test("verifyPassword throws for a malformed Argon2id value", async () => {
    // A corrupt Argon2id string keeps the pre-migration behaviour: the
    // caller turns the throw into a controlled 500, exactly as a corrupt
    // bcrypt hash was treated before.
    await assert.rejects(verifyPassword(PASSWORD, "$argon2id$garbage"));
});

test("verifyPassword fails closed for a malformed bcrypt value", async () => {
    // Native bcrypt.compare returns false (never throws) for a malformed
    // hash, so a corrupt bcrypt string behaves exactly like a wrong
    // password rather than a server error.
    assert.equal(await verifyPassword(PASSWORD, "$2b$10$tooshort"), false);
});

test("the unknown-account dummy is an Argon2id hash with the same parameters", async () => {
    assert.match(UNKNOWN_PASSWORD_HASH, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    assert.equal(isArgon2idHash(UNKNOWN_PASSWORD_HASH), true);
    // The dummy's plaintext is irrelevant and never a real credential;
    // it only has to cost the same work as a real account's hash.
    assert.equal(await verifyPassword("gnosis-unknown-account-dummy", UNKNOWN_PASSWORD_HASH), true);
    assert.equal(await verifyPassword("anything-else", UNKNOWN_PASSWORD_HASH), false);
});

test("verify time stays well under a second", async () => {
    const hash = await hashPassword(PASSWORD);
    const started = Date.now();
    assert.equal(await verifyPassword(PASSWORD, hash), true);
    const elapsed = Date.now() - started;
    // Measured ~45 ms on this hardware; the bound is deliberately loose
    // (shared CI runners are slower) — it guards against a parameter
    // typo (e.g. an extra zero on memory or iterations), not against
    // ordinary machine variation.
    assert.ok(elapsed < 1000, `Argon2id verify took ${elapsed} ms`);
});

test("unknown-account and known-account verification do not obviously diverge", async () => {
    const known = await hashPassword(PASSWORD);
    const startedDummy = Date.now();
    await verifyPassword("whatever-password", UNKNOWN_PASSWORD_HASH);
    const dummyMs = Date.now() - startedDummy;
    const startedKnown = Date.now();
    await verifyPassword(PASSWORD, known);
    const knownMs = Date.now() - startedKnown;
    // Coarse smoke check only: both paths run the same algorithm with
    // the same parameters, so they must stay in the same order of
    // magnitude. (A known bcrypt account is slower during the
    // transition — see passwordHash.js — but that gap closes as
    // accounts migrate and is rate-limited to 5 attempts per 15 min.)
    assert.ok(Math.abs(dummyMs - knownMs) < 500, `dummy ${dummyMs} ms vs known ${knownMs} ms`);
});
