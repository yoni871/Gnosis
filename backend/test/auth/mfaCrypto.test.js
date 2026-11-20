const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
    getMfaEncryptionKey,
    getMfaEncryptionKeyPrevious,
    getCurrentMfaKeyVersion,
    getMfaEncryptionKeyForVersion,
    isMfaEncryptionConfigured,
    encryptTotpSecret,
    decryptTotpSecret,
} = require("../../src/utils/mfaCrypto");

const HEX_KEY = crypto.randomBytes(32).toString("hex");
const BASE64_KEY = crypto.randomBytes(32).toString("base64");
const PREVIOUS_KEY = crypto.randomBytes(32).toString("hex");

function setKeys({ current, previous, version } = {}) {
    if (current === undefined) {
        delete process.env.MFA_ENCRYPTION_KEY;
    } else {
        process.env.MFA_ENCRYPTION_KEY = current;
    }
    if (previous === undefined) {
        delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;
    } else {
        process.env.MFA_ENCRYPTION_KEY_PREVIOUS = previous;
    }
    if (version === undefined) {
        delete process.env.MFA_KEY_VERSION;
    } else {
        process.env.MFA_KEY_VERSION = version;
    }
}

test("accepts a 64-hex key and a 44-char base64 key", () => {
    process.env.MFA_ENCRYPTION_KEY = HEX_KEY;
    assert.equal(getMfaEncryptionKey().length, 32);
    assert.equal(isMfaEncryptionConfigured(), true);
    process.env.MFA_ENCRYPTION_KEY = BASE64_KEY;
    assert.equal(getMfaEncryptionKey().length, 32);
    assert.equal(isMfaEncryptionConfigured(), true);
});

test("rejects short, malformed, and empty keys", () => {
    for (const value of ["", "short", "a".repeat(63), "a".repeat(65), "zz".repeat(32), "not-base64!"]) {
        process.env.MFA_ENCRYPTION_KEY = value;
        assert.equal(getMfaEncryptionKey(), null, JSON.stringify(value));
        assert.equal(isMfaEncryptionConfigured(), false);
    }
    delete process.env.MFA_ENCRYPTION_KEY;
    assert.equal(getMfaEncryptionKey(), null);
});

test("encrypt/decrypt round-trips and the ciphertext never contains the secret", () => {
    const key = Buffer.from(HEX_KEY, "hex");
    const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
    const stored = encryptTotpSecret(secret, key);
    assert.equal(typeof stored, "string");
    assert.ok(!stored.includes(secret));
    assert.equal(decryptTotpSecret(stored, key), secret);
});

test("the same secret encrypts differently every time (fresh IV)", () => {
    const key = Buffer.from(HEX_KEY, "hex");
    const first = encryptTotpSecret("JBSWY3DPEHPK3PXP", key);
    const second = encryptTotpSecret("JBSWY3DPEHPK3PXP", key);
    assert.notEqual(first, second);
});

test("a wrong key or tampered ciphertext fails decryption", () => {
    const key = Buffer.from(HEX_KEY, "hex");
    const other = crypto.randomBytes(32);
    const stored = encryptTotpSecret("JBSWY3DPEHPK3PXP", key);
    assert.throws(() => decryptTotpSecret(stored, other));
    const tampered = Buffer.from(stored, "base64");
    tampered[tampered.length - 1] ^= 1;
    assert.throws(() => decryptTotpSecret(tampered.toString("base64"), key));
    assert.throws(() => decryptTotpSecret("not-base64!!", key));
});

test("key ring: current version maps to the current key, previous to the previous key", () => {
    setKeys({ current: HEX_KEY, previous: PREVIOUS_KEY, version: "2" });
    assert.equal(getCurrentMfaKeyVersion(), 2);
    assert.equal(getMfaEncryptionKeyForVersion(2).toString("hex"), HEX_KEY);
    assert.equal(getMfaEncryptionKeyForVersion(1).toString("hex"), PREVIOUS_KEY);
    assert.equal(getMfaEncryptionKeyPrevious().toString("hex"), PREVIOUS_KEY);
    // A version-1 row encrypts under the previous key and a version-2
    // row under the current key; each decrypts only under its own.
    const secret = "JBSWY3DPEHPK3PXP";
    const v1 = encryptTotpSecret(secret, getMfaEncryptionKeyForVersion(1));
    const v2 = encryptTotpSecret(secret, getMfaEncryptionKeyForVersion(2));
    assert.equal(decryptTotpSecret(v1, getMfaEncryptionKeyForVersion(1)), secret);
    assert.equal(decryptTotpSecret(v2, getMfaEncryptionKeyForVersion(2)), secret);
    assert.throws(() => decryptTotpSecret(v1, getMfaEncryptionKeyForVersion(2)));
    assert.throws(() => decryptTotpSecret(v2, getMfaEncryptionKeyForVersion(1)));
});

test("key ring: without a previous key only version 1 exists and version 2 is unknown", () => {
    setKeys({ current: HEX_KEY });
    assert.equal(getCurrentMfaKeyVersion(), 1);
    assert.equal(getMfaEncryptionKeyForVersion(1).toString("hex"), HEX_KEY);
    assert.equal(getMfaEncryptionKeyForVersion(2), null);
    assert.equal(getMfaEncryptionKeyForVersion(0), null);
    assert.equal(getMfaEncryptionKeyPrevious(), null);
});

test("key ring: unknown versions fail closed", () => {
    setKeys({ current: HEX_KEY, previous: PREVIOUS_KEY, version: "2" });
    assert.equal(getMfaEncryptionKeyForVersion(3), null);
    assert.equal(getMfaEncryptionKeyForVersion(0), null);
    assert.equal(getMfaEncryptionKeyForVersion(-1), null);
    // A malformed MFA_KEY_VERSION falls back to 1 (the original key).
    setKeys({ current: HEX_KEY, previous: PREVIOUS_KEY, version: "not-a-number" });
    assert.equal(getCurrentMfaKeyVersion(), 1);
    setKeys({ current: HEX_KEY, previous: PREVIOUS_KEY, version: "0" });
    assert.equal(getCurrentMfaKeyVersion(), 1);
});
