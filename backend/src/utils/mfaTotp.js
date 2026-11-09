// TOTP (RFC 6238) via otplib, isolated behind this module so the
// library's API shape lives in exactly one place.
//
// otplib v13 is async and plugin-based: a TOTP instance needs explicit
// crypto and base32 plugins, generate/verify return promises, and
// verify takes the token positionally with options second. The clock
// tolerance is epochTolerance in seconds: 30 accepts the current step
// plus one step either side, covering authenticator clock skew without
// widening the window to a full minute. Defaults are otherwise
// standard: 30-second period, 6 digits, SHA-1, 20-byte secret.
// Nothing here ever logs a secret or a code.

const { TOTP, NobleCryptoPlugin, ScureBase32Plugin } = require("otplib");

const TOTP_CODE_PATTERN = /^\d{6}$/;
const TOTP_EPOCH_TOLERANCE_SECONDS = 30;

function createTotp() {
    return new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() });
}

function isTotpCodeFormat(value) {
    return typeof value === "string" && TOTP_CODE_PATTERN.test(value);
}

function generateTotpSecret() {
    return createTotp().generateSecret();
}

function buildOtpAuthUrl({ label, secret }) {
    return createTotp().toURI({ label, issuer: "Gnosis", secret });
}

// Test helper only: generate the code the user's authenticator would
// currently show, so tests can complete enrollment and login without
// a real device. Never used in request handling.
async function generateTotpCode(secret) {
    return createTotp().generate({ secret });
}

// Returns true only for a code valid in the current step or one step
// either side. A malformed secret or a library failure is false, never
// a throw: callers treat it as a wrong code.
async function verifyTotpCode(secret, token) {
    try {
        const result = await createTotp().verify(token, {
            secret,
            epochTolerance: TOTP_EPOCH_TOLERANCE_SECONDS,
        });
        return result && result.valid === true;
    } catch {
        return false;
    }
}

module.exports = {
    TOTP_CODE_PATTERN,
    TOTP_EPOCH_TOLERANCE_SECONDS,
    isTotpCodeFormat,
    generateTotpSecret,
    buildOtpAuthUrl,
    generateTotpCode,
    verifyTotpCode,
};
