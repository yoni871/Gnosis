const test = require("node:test");
const assert = require("node:assert/strict");
const { validateEmailConfig, requireEmailConfig } = require("../../src/config/emailConfig");

const VALID = {
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM: "Gnosis <verify@example.com>",
    FRONTEND_URL: "https://frontend.example.invalid",
};

test("valid configuration is normalized", () => {
    const { config, errors } = validateEmailConfig({ ...VALID, FRONTEND_URL: "https://frontend.example.invalid///" });
    assert.equal(errors, undefined);
    assert.equal(config.resendApiKey, "re_test_key");
    assert.equal(config.emailFrom, "Gnosis <verify@example.com>");
    assert.equal(config.frontendUrl, "https://frontend.example.invalid");
});

test("a bare sender address is accepted", () => {
    const { config, errors } = validateEmailConfig({ ...VALID, EMAIL_FROM: "verify@example.com" });
    assert.equal(errors, undefined);
    assert.equal(config.emailFrom, "verify@example.com");
});

test("a missing sender falls back to the product identity (issue #118)", () => {
    for (const env of [{ ...VALID, EMAIL_FROM: "" }, { ...VALID, EMAIL_FROM: undefined }]) {
        const { config, errors } = validateEmailConfig(env);
        assert.equal(errors, undefined);
        assert.equal(config.emailFrom, "Gnosis <noreply@studygnosis.com>");
    }
});

test("each missing or malformed value is reported by field, never by value", () => {
    const cases = [
        [{ ...VALID, RESEND_API_KEY: "" }, "RESEND_API_KEY"],
        [{ ...VALID, RESEND_API_KEY: undefined }, "RESEND_API_KEY"],
        [{ ...VALID, EMAIL_FROM: "not-an-email" }, "EMAIL_FROM"],
        [{ ...VALID, EMAIL_FROM: "a@.b.com" }, "EMAIL_FROM"],
        [{ ...VALID, EMAIL_FROM: "Name <not-an-email>" }, "EMAIL_FROM"],
        [{ ...VALID, FRONTEND_URL: "" }, "FRONTEND_URL"],
        [{ ...VALID, FRONTEND_URL: "http://frontend.example.invalid" }, "FRONTEND_URL"],
        [{ ...VALID, FRONTEND_URL: "frontend.example.invalid" }, "FRONTEND_URL"],
        [{ ...VALID, FRONTEND_URL: "https://" }, "FRONTEND_URL"],
    ];
    for (const [env, field] of cases) {
        const { config, errors } = validateEmailConfig(env);
        assert.equal(config, undefined);
        assert.equal(errors.length, 1, JSON.stringify(env));
        assert.equal(errors[0].field, field);
        const value = env[field];
        if (typeof value === "string" && value.length > 0) {
            assert.ok(!JSON.stringify(errors).includes(value), "errors must never carry a value");
        }
    }
});

test("missing values are reported together (the sender now has a default)", () => {
    const { errors } = validateEmailConfig({});
    assert.deepEqual(errors.map((error) => error.field), ["RESEND_API_KEY", "FRONTEND_URL"]);
});

test("startup failure is generic: no variable name, no value", () => {
    assert.throws(
        () => requireEmailConfig({ ...VALID, RESEND_API_KEY: "" }),
        (error) => {
            assert.equal(error.message, "Server configuration error: required server configuration is missing.");
            assert.ok(!error.message.includes("RESEND_API_KEY"));
            return true;
        }
    );
    assert.equal(requireEmailConfig(VALID).frontendUrl, "https://frontend.example.invalid");
});

test("nothing domain-specific is hardcoded in the module", () => {
    const fs = require("node:fs");
    const source = fs.readFileSync(require.resolve("../../src/config/emailConfig"), "utf8");
    for (const forbidden of ["onboarding@resend.dev", "studygnosis.com", "vercel.app"]) {
        assert.ok(!source.includes(forbidden), `emailConfig must not hardcode ${forbidden}`);
    }
});
