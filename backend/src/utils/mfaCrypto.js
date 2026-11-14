// TOTP secret encryption for roadmap T2.1.
//
// The TOTP secret is stored encrypted (AES-256-GCM), never plaintext:
// a database read alone must not yield a usable authenticator secret.
// The key comes from MFA_ENCRYPTION_KEY, a dedicated 32-byte operator
// secret — deliberately NOT derived from JWT_SECRET, so rotating one
// never silently invalidates the other, and NOT required at boot:
// MFA is optional, so a missing key fails CLOSED at enrollment/verify
// time (controlled 503) instead of preventing the server from starting.
// Accepted forms: 64 hex characters, or 44 base64 characters (32 bytes).
// Anything else counts as absent. Nothing here ever logs a key, a
// secret, or a ciphertext.

const crypto = require("node:crypto");

const MFA_KEY_HEX_PATTERN = /^[a-fA-F0-9]{64}$/;
const MFA_KEY_BASE64_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

function parseMfaKey(value) {
    if (typeof value !== "string" || value === "") {
        return null;
    }
    if (MFA_KEY_HEX_PATTERN.test(value)) {
        return Buffer.from(value, "hex");
    }
    if (MFA_KEY_BASE64_PATTERN.test(value)) {
        const decoded = Buffer.from(value, "base64");
        return decoded.length === 32 ? decoded : null;
    }
    return null;
}

function getMfaEncryptionKey() {
    return parseMfaKey(process.env.MFA_ENCRYPTION_KEY);
}

// The previous key, set only during a rotation (design §3.2). It
// decrypts rows whose key_version is the previous version; it is
// never used to encrypt. Absent (the normal state) means only
// current-version rows exist.
function getMfaEncryptionKeyPrevious() {
    return parseMfaKey(process.env.MFA_ENCRYPTION_KEY_PREVIOUS);
}

function isMfaEncryptionConfigured() {
    return getMfaEncryptionKey() !== null;
}

// The absolute version of the current key. Version 1 is the original
// MFA_ENCRYPTION_KEY; each rotation increments it by one (the
// operator sets MFA_KEY_VERSION to the new version when staging the
// new key, design §3.3 step 3). The version number is needed because
// the ring maps an absolute row version to a key: with only the two
// key variables, "current" and "previous" are relative, and a second
// rotation would make an old version number ambiguous. Absent or
// malformed means 1 (the original key).
function getCurrentMfaKeyVersion() {
    const raw = process.env.MFA_KEY_VERSION;
    if (typeof raw !== "string" || raw === "") {
        return 1;
    }
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1;
}

// Key ring (design §3.2). Returns the key Buffer for a row's
// key_version, or null when the version is unknown — callers fail
// closed (MfaUnavailableError) on null. The current version maps to
// MFA_ENCRYPTION_KEY; the previous version maps to
// MFA_ENCRYPTION_KEY_PREVIOUS; anything else is unknown.
function getMfaEncryptionKeyForVersion(version) {
    const current = getCurrentMfaKeyVersion();
    if (version === current) {
        return getMfaEncryptionKey();
    }
    if (version === current - 1) {
        return getMfaEncryptionKeyPrevious();
    }
    return null;
}

// Layout: base64(iv || ciphertext || tag). The IV is 12 fresh random
// bytes per encryption, so the same secret encrypts differently every
// time and no two rows share a nonce.
function encryptTotpSecret(secret, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, ciphertext, tag]).toString("base64");
}

function decryptTotpSecret(stored, key) {
    const combined = Buffer.from(stored, "base64");
    if (combined.length < 12 + 16 + 1) {
        throw new Error("Invalid encrypted TOTP secret.");
    }
    const iv = combined.subarray(0, 12);
    const tag = combined.subarray(combined.length - 16);
    const ciphertext = combined.subarray(12, combined.length - 16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

module.exports = {
    getMfaEncryptionKey,
    getMfaEncryptionKeyPrevious,
    getCurrentMfaKeyVersion,
    getMfaEncryptionKeyForVersion,
    isMfaEncryptionConfigured,
    encryptTotpSecret,
    decryptTotpSecret,
};
