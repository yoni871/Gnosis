const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { testEnvironment } = require("../../scripts/test");

const backendDir = path.join(__dirname, "..", "..");
const STRONG_JWT = "test-secret-for-server-config-tests";
const STRONG_RATE = "test-secret-for-server-config-tests";

function runCheck(extra) {
    const env = testEnvironment();
    for (const [key, value] of Object.entries(extra)) {
        if (value === undefined) {
            delete env[key];
        } else {
            env[key] = value;
        }
    }
    return spawnSync(process.execPath, ["scripts/check-config.js"], {
        cwd: backendDir,
        env,
        encoding: "utf8",
    });
}

test("check-config passes with strong secrets", () => {
    const result = runCheck({ JWT_SECRET: STRONG_JWT, RATE_LIMIT_KEY_SECRET: STRONG_RATE });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Startup configuration fields are valid\./);
});

test("check-config fails on a missing JWT_SECRET", () => {
    const result = runCheck({ JWT_SECRET: undefined, RATE_LIMIT_KEY_SECRET: STRONG_RATE });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /JWT_SECRET/);
});

// Audit N06: a short secret is invalid, not just a missing one, and the
// diagnostic names the field only — never the value.
test("check-config fails on a short JWT_SECRET without echoing it", () => {
    const result = runCheck({ JWT_SECRET: "too-short", RATE_LIMIT_KEY_SECRET: STRONG_RATE });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /JWT_SECRET/);
    assert.ok(!result.stdout.includes("too-short"), result.stdout);
    assert.ok(!result.stderr.includes("too-short"), result.stderr);
});

test("check-config fails on a short RATE_LIMIT_KEY_SECRET without echoing it", () => {
    const result = runCheck({ JWT_SECRET: STRONG_JWT, RATE_LIMIT_KEY_SECRET: "too-short" });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /RATE_LIMIT_KEY_SECRET/);
    assert.ok(!result.stdout.includes("too-short"), result.stdout);
    assert.ok(!result.stderr.includes("too-short"), result.stderr);
});

test("check-config accepts 64-hex secrets", () => {
    const result = runCheck({
        JWT_SECRET: "0123456789abcdef".repeat(4),
        RATE_LIMIT_KEY_SECRET: "fedcba9876543210".repeat(4),
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Startup configuration fields are valid\./);
});
