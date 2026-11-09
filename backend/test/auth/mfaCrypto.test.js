const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
    getMfaEncryptionKey,
    isMfaEncryptionConfigured,
    encryptTotpSecret,
    decryptTotpSecret,
} = require("../../src/utils/mfaCrypto");

const HEX_KEY = crypto.randomBytes(32).toString("hex");
const BASE64_KEY = crypto.randomBytes(32).toString("base64");

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
