const test = require("node:test");
const assert = require("node:assert/strict");
const { getAdminEmails, isAdminEmail } = require("../../src/utils/adminAuth");

test("an empty or unset allowlist means no admins", () => {
    delete process.env.ADMIN_EMAILS;
    assert.deepEqual(getAdminEmails(), new Set());
    assert.equal(isAdminEmail("admin@example.invalid"), false);
    process.env.ADMIN_EMAILS = "";
    assert.equal(isAdminEmail("admin@example.invalid"), false);
    process.env.ADMIN_EMAILS = "   ";
    assert.equal(isAdminEmail("admin@example.invalid"), false);
});

test("the allowlist matches case-insensitively and trims whitespace", () => {
    process.env.ADMIN_EMAILS = "Admin@Example.Invalid, ops@example.invalid ,";
    assert.deepEqual(getAdminEmails(), new Set(["admin@example.invalid", "ops@example.invalid"]));
    assert.equal(isAdminEmail("ADMIN@example.invalid"), true);
    assert.equal(isAdminEmail("ops@example.invalid"), true);
    assert.equal(isAdminEmail("other@example.invalid"), false);
    assert.equal(isAdminEmail(""), false);
    assert.equal(isAdminEmail(null), false);
});
