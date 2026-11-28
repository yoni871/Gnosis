// Accept only canonical encodings of at least 32 bytes. This rejects plain
// passphrases and obvious low-variation placeholders, but no validator can
// prove how a value was generated. Hosted entropy requires operator evidence.
const MIN_SECRET_BYTES = 32;
const HEX_RE = /^(?:[0-9a-fA-F]{2}){32,}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const PLACEHOLDER_RE = /placeholder|change.?me|synthetic|example|password|secret|test/i;

function secretBytes(value) {
    if (typeof value !== 'string' || PLACEHOLDER_RE.test(value)) return null;
    if (HEX_RE.test(value)) return Buffer.from(value, 'hex');
    if (!BASE64URL_RE.test(value)) return null;
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.length < MIN_SECRET_BYTES || decoded.toString('base64url') !== value) return null;
    return decoded;
}

function isStrongSecret(value) {
    const bytes = secretBytes(value);
    if (!bytes || bytes.length < MIN_SECRET_BYTES) return false;
    // Reject repetitions, encoded human-readable placeholders, and short
    // repeating blocks. These are conservative hygiene checks, not an
    // entropy estimate or a substitute for CSPRNG generation evidence.
    if (new Set(bytes).size < 16) return false;
    if (bytes.every(byte => byte >= 32 && byte <= 126)) return false;
    for (let period = 1; period <= 16; period++) {
        if (bytes.every((byte, index) => byte === bytes[index % period])) return false;
    }
    return true;
}

function hasDistinctStrongSecrets(jwtSecret, rateLimitSecret) {
    if (!isStrongSecret(jwtSecret) || !isStrongSecret(rateLimitSecret)) return false;
    return !secretBytes(jwtSecret).equals(secretBytes(rateLimitSecret));
}

module.exports = { isStrongSecret, hasDistinctStrongSecrets, MIN_SECRET_BYTES };
