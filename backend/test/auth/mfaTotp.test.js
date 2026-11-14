const test = require("node:test");
const assert = require("node:assert/strict");
const {
    base32Encode,
    isTotpCodeFormat,
    generateTotpSecret,
    buildOtpAuthUrl,
    generateTotpCode,
    generateTotpCodeForStep,
    verifyTotpCode,
} = require("../../src/utils/mfaTotp");

test("generated secrets are 32-char base32 and produce verifiable codes", async () => {
    const secret = generateTotpSecret();
    assert.equal(typeof secret, "string");
    assert.equal(secret.length, 32);
    assert.match(secret, /^[A-Z2-7]+$/);
    const code = await generateTotpCode(secret);
    assert.match(code, /^\d{6}$/);
    assert.equal(await verifyTotpCode(secret, code), true);
});

test("a wrong code, a malformed code, and a bad secret all fail closed", async () => {
    const secret = generateTotpSecret();
    const code = await generateTotpCode(secret);
    const wrong = code === "000000" ? "000001" : "000000";
    assert.equal(await verifyTotpCode(secret, wrong), false);
    assert.equal(await verifyTotpCode(secret, "not-a-code"), false);
    assert.equal(await verifyTotpCode("not-a-secret!!", code), false);
    assert.equal(await verifyTotpCode("", code), false);
});

test("isTotpCodeFormat accepts exactly six digits", () => {
    assert.equal(isTotpCodeFormat("123456"), true);
    assert.equal(isTotpCodeFormat("12345"), false);
    assert.equal(isTotpCodeFormat("1234567"), false);
    assert.equal(isTotpCodeFormat("12345a"), false);
    assert.equal(isTotpCodeFormat(""), false);
    assert.equal(isTotpCodeFormat(null), false);
});

test("the otpauth URL names Gnosis and carries the secret, never a code", () => {
    const secret = generateTotpSecret();
    const url = buildOtpAuthUrl({ label: "reader@example.invalid", secret });
    assert.ok(url.startsWith("otpauth://totp/Gnosis:"));
    assert.ok(url.includes(`secret=${secret}`));
    assert.ok(url.includes("issuer=Gnosis"));
});

// RFC 6238 Appendix B test vectors (SHA-1, secret = ASCII
// "12345678901234567890"), truncated to 6 digits. The secret is
// derived from its ASCII form at runtime so no secret-looking
// literal lives in the repo — GitGuardian incident 40058660 flagged
// the base32 form as a Generic High Entropy Secret, a false positive
// on this published test vector. This pins the implementation to the
// standard so any authenticator app agrees with the server — and it
// is what the otplib implementation it replaced produced for the same
// epochs.
test("matches RFC 6238 test vectors (SHA-1, 6-digit truncation)", async () => {
    const secret = base32Encode(Buffer.from("12345678901234567890", "ascii"));
    const nowStep = Math.floor(Date.now() / 1000 / 30);
    const cases = [
        [59, "287082"],
        [1111111109, "081804"],
        [1234567890, "005924"],
    ];
    for (const [epoch, expected] of cases) {
        const step = Math.floor(epoch / 30);
        const code = await generateTotpCodeForStep(secret, step - nowStep);
        assert.equal(code, expected);
    }
});
