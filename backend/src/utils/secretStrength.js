// Secret-strength gate (audit N06, roadmap T1.5).
//
// JWT_SECRET and RATE_LIMIT_KEY_SECRET were previously checked for
// presence only. A short or guessable value is a real weakness: HS256
// with a weak secret is offline brute-forceable, and the rate-limit key
// is the only thing standing between an attacker and forged bucket keys.
//
// Acceptance rule (documented here so the boot check, the config check,
// and the tests all agree): a value counts as at least 32 random bytes
// if it is 64 hex characters (32 bytes), or at least 43 base64url
// characters (43 * 6 bits = 258 bits, i.e. 32 bytes), or otherwise at
// least 32 characters long. Anything shorter fails boot with the
// existing generic startup error, which names no variable and no value.
//
// Length is a proxy, not a proof of randomness: a 32-character
// passphrase is accepted by this rule, and only the operator can ensure
// a deployed value was actually generated randomly. The local setup
// generator (backend/scripts/local/setup.js) already produces 256-bit
// secrets, and deployed secrets must be shown to meet this bar or
// rotated (an operator step; rotation alone does not revoke sessions,
// so pair it with a session-revocation step).

const MIN_SECRET_CHARS = 32;
const MIN_BASE64URL_CHARS = 43;
const HEX_64_RE = /^[0-9a-fA-F]{64}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function isStrongSecret(value) {
    if (typeof value !== "string" || value.length === 0) {
        return false;
    }
    if (HEX_64_RE.test(value)) {
        return true;
    }
    if (value.length >= MIN_BASE64URL_CHARS && BASE64URL_RE.test(value)) {
        return true;
    }
    return value.length >= MIN_SECRET_CHARS;
}

module.exports = { isStrongSecret, MIN_SECRET_CHARS, MIN_BASE64URL_CHARS };
