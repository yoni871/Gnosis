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

// Test helper only: generate the code for a time step offset from the
// current one (offset 1 = the next 30-second step). Tests use it to
// get a code from a fresh step without waiting for the clock: TOTP
// step burning (F6) makes a step single-use, so a second login in
// the same step takes a code from the next step (still within the
// server's ±1-step tolerance). Never used in request handling.
async function generateTotpCodeForStep(secret, stepOffset) {
    const step = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS) + stepOffset;
    return createTotp().generate({ secret, epoch: step * TOTP_PERIOD_SECONDS });
}

// TOTP time step in seconds (RFC 6238 default). A code is valid for
// the step it was generated in; the step number is
// floor(epochSeconds / TOTP_PERIOD_SECONDS).
const TOTP_PERIOD_SECONDS = 30;

// The time step a code belongs to, or null when the code is invalid.
// Generates the code for the current step and one step either side
// (the same ±1-step tolerance as verifyTotpCode) and returns the step
// whose code matches. A code is deterministic per step and secret, so
// the match identifies the step unambiguously. Callers use the step
// for replay protection: a step at or below the account's last
// accepted step has already been used and must be rejected, even
// with a fresh challenge. A malformed secret or a library failure is
// null, never a throw.
async function verifyTotpCodeStep(secret, token) {
    if (!isTotpCodeFormat(token)) {
        return null;
    }
    const nowStep = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);
    for (const step of [nowStep - 1, nowStep, nowStep + 1]) {
        try {
            const expected = await createTotp().generate({
                secret,
                epoch: step * TOTP_PERIOD_SECONDS,
            });
            if (expected === token) {
                return step;
            }
        } catch {
            return null;
        }
    }
    return null;
}

// Returns true only for a code valid in the current step or one step
// either side. A malformed secret or a library failure is false, never
// a throw: callers treat it as a wrong code.
async function verifyTotpCode(secret, token) {
    return (await verifyTotpCodeStep(secret, token)) !== null;
}

module.exports = {
    TOTP_CODE_PATTERN,
    TOTP_EPOCH_TOLERANCE_SECONDS,
    TOTP_PERIOD_SECONDS,
    isTotpCodeFormat,
    generateTotpSecret,
    buildOtpAuthUrl,
    generateTotpCode,
    generateTotpCodeForStep,
    verifyTotpCode,
    verifyTotpCodeStep,
};
