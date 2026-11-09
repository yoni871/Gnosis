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
// Length is a proxy, not a proof of randomness, so the rule also carries
// #72's entropy sanity checks (ported by the integration disposition):
// at least 12 distinct characters, not a single repeated character, and
// no placeholder text (changeme / your-secret / example-secret). A
// degenerate value such as "a".repeat(64) passes the length rule but is
// not 32 random bytes, so it fails here. Only the operator can ensure a
// deployed value was actually generated randomly. The local setup
// generator (backend/scripts/local/setup.js) already produces 256-bit
// secrets, and deployed secrets must be shown to meet this bar or
// rotated (an operator step; rotation alone does not revoke sessions,
// so pair it with a session-revocation step).
//
// The two secrets must also differ from each other: requireStrongSecrets
// (boot + check-config + the app.js import-time check) enforces that.
// Sharing one value across both uses would let a leak of one compromise
// the other.

const MIN_SECRET_CHARS = 32;
const MIN_BASE64URL_CHARS = 43;
const MIN_DISTINCT_CHARS = 12;
const HEX_64_RE = /^[0-9a-fA-F]{64}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
// Ported from #72 (securityConfig.strongSecret).
const REPEATED_CHAR_RE = /^(.)\1+$/;
const PLACEHOLDER_RE = /change.?me|replace.?me|your.?secret|example.?secret/i;

function isStrongSecret(value) {
    if (typeof value !== "string" || value.length === 0) {
        return false;
    }
    if (REPEATED_CHAR_RE.test(value)) {
        return false;
    }
    if (PLACEHOLDER_RE.test(value)) {
        return false;
    }
    if (new Set(value).size < MIN_DISTINCT_CHARS) {
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

// Both secrets strong and different from each other. Used at boot
// (server.js), by check-config.js, and at the app.js import-time check
// (via config/securityConfig.js, which delegates here) so serverless
// entries that bypass server.js enforce the same bar. Throws the
// generic message, which names no variable and no value.
function requireStrongSecrets(env = process.env) {
    if (!isStrongSecret(env.JWT_SECRET) || !isStrongSecret(env.RATE_LIMIT_KEY_SECRET)
        || env.JWT_SECRET === env.RATE_LIMIT_KEY_SECRET) {
        throw new Error("Server configuration error: invalid security configuration.");
    }
}

module.exports = { isStrongSecret, requireStrongSecrets, MIN_SECRET_CHARS, MIN_BASE64URL_CHARS, MIN_DISTINCT_CHARS };
