// TOTP (RFC 6238) with Node's built-in crypto — no third-party library.
//
// This module used to wrap otplib v13, but otplib v13's base32 plugin
// (@otplib/plugin-base32-scure) require()s the ESM-only @scure/base
// package from a CommonJS file. That throws ERR_REQUIRE_ESM on the
// Vercel Preview runtime (Node 22.x), which killed the whole API
// function at startup — every endpoint 500'd after PR #93 merged,
// because app.js requires the MFA routes at import time. CI (Node
// 22.23.4) and local Node 24 both support require(esm), so the suite
// never caught it. Depending on a runtime's require(esm) support for
// a security-critical login path is fragile, so TOTP lives here now
// as ~90 lines of RFC 6238 on top of node:crypto: HMAC-SHA1, dynamic
// truncation, 6 digits, 30-second period, 20-byte secrets.
//
// Behaviour is identical to the otplib implementation it replaces:
// secrets are 32-char base32, codes match RFC 6238 test vectors
// (see test/auth/mfaTotp.test.js), the otpauth URL format is
// unchanged, and verification accepts the current step plus one step
// either side (the same ±1-step tolerance as before). Nothing here
// ever logs a secret or a code.

const crypto = require("node:crypto");

const TOTP_CODE_PATTERN = /^\d{6}$/;
const TOTP_EPOCH_TOLERANCE_SECONDS = 30;

// TOTP time step in seconds (RFC 6238 default). A code is valid for
// the step it was generated in; the step number is
// floor(epochSeconds / TOTP_PERIOD_SECONDS).
const TOTP_PERIOD_SECONDS = 30;

// Base32 (RFC 4648) codec, uppercase alphabet, no padding on encode.
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE32_LOOKUP = new Map(
    [...BASE32_ALPHABET].map((char, index) => [char, index]),
);

function base32Encode(bytes) {
    let out = "";
    let bits = 0;
    let value = 0;
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            out += BASE32_ALPHABET[(value >>> bits) & 31];
        }
    }
    if (bits > 0) {
        out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }
    return out;
}

function base32Decode(text) {
    const clean = String(text).toUpperCase().replace(/=+$/, "");
    if (clean.length === 0) {
        throw new Error("Invalid Base32 string.");
    }
    let bits = 0;
    let value = 0;
    const bytes = [];
    for (const char of clean) {
        const index = BASE32_LOOKUP.get(char);
        if (index === undefined) {
            throw new Error("Invalid Base32 string.");
        }
        value = (value << 5) | index;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((value >>> bits) & 0xff);
        }
    }
    return Buffer.from(bytes);
}

// HOTP (RFC 4226): HMAC-SHA1 of the 8-byte big-endian counter,
// dynamic truncation, mod 10^6, zero-padded to 6 digits. Arithmetic
// (not bit shifts) keeps the 31-bit value exact.
function hotpCode(secretBytes, counter) {
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto
        .createHmac("sha1", secretBytes)
        .update(counterBuf)
        .digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
        (hmac[offset] & 0x7f) * 0x1000000 +
        (hmac[offset + 1] & 0xff) * 0x10000 +
        (hmac[offset + 2] & 0xff) * 0x100 +
        (hmac[offset + 3] & 0xff);
    return String(binary % 1000000).padStart(6, "0");
}

function isTotpCodeFormat(value) {
    return typeof value === "string" && TOTP_CODE_PATTERN.test(value);
}

function generateTotpSecret() {
    return base32Encode(crypto.randomBytes(20));
}

function buildOtpAuthUrl({ label, secret }) {
    return (
        "otpauth://totp/Gnosis:" +
        encodeURIComponent(label) +
        "?secret=" +
        secret +
        "&issuer=Gnosis"
    );
}

// Test helper only: generate the code the user's authenticator would
// currently show, so tests can complete enrollment and login without
// a real device. Never used in request handling.
async function generateTotpCode(secret) {
    const secretBytes = base32Decode(secret);
    const step = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);
    return hotpCode(secretBytes, step);
}

// Test helper only: generate the code for a time step offset from the
// current one (offset 1 = the next 30-second step). Tests use it to
// get a code from a fresh step without waiting for the clock: TOTP
// step burning (F6) makes a step single-use, so a second login in
// the same step takes a code from the next step (still within the
// server's ±1-step tolerance). Never used in request handling.
async function generateTotpCodeForStep(secret, stepOffset) {
    const secretBytes = base32Decode(secret);
    const step =
        Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS) + stepOffset;
    return hotpCode(secretBytes, step);
}

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
    let secretBytes;
    try {
        secretBytes = base32Decode(secret);
    } catch {
        return null;
    }
    const nowStep = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);
    for (const step of [nowStep - 1, nowStep, nowStep + 1]) {
        try {
            if (hotpCode(secretBytes, step) === token) {
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
    base32Encode,
    isTotpCodeFormat,
    generateTotpSecret,
    buildOtpAuthUrl,
    generateTotpCode,
    generateTotpCodeForStep,
    verifyTotpCode,
    verifyTotpCodeStep,
};
