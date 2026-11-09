const test = require("node:test");
const assert = require("node:assert/strict");
const {
    RECOVERY_CODE_COUNT,
    formatRecoveryCode,
    normalizeRecoveryCode,
    isRecoveryCodeFormat,
    generateRecoveryCodeSet,
    hashRecoveryCode,
    matchesRecoveryCode,
} = require("../../src/utils/mfaRecoveryCodes");

test("generates ten unique codes in XXXX-XXXX-XXXX display form", () => {
    const set = generateRecoveryCodeSet();
    assert.equal(set.length, RECOVERY_CODE_COUNT);
    const shown = set.map((record) => record.code);
    assert.equal(new Set(shown).size, RECOVERY_CODE_COUNT);
    for (const code of shown) {
        assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }
    // No plaintext code is stored: hashes and salts differ per code.
    const hashes = set.map((record) => record.codeHash);
    assert.equal(new Set(hashes).size, RECOVERY_CODE_COUNT);
    for (const record of set) {
        assert.ok(!record.codeHash.includes(record.code.replace(/-/g, "")));
    }
});

test("normalize strips dashes and spaces and uppercases; other shapes are null", () => {
    assert.equal(normalizeRecoveryCode("abcd-efgh-ijkl"), "ABCDEFGHIJKL");
    assert.equal(normalizeRecoveryCode("abcd efgh ijkl"), "ABCDEFGHIJKL");
    assert.equal(normalizeRecoveryCode("ABCDEFGHIJKL"), "ABCDEFGHIJKL");
    assert.equal(normalizeRecoveryCode("abc"), null);
    assert.equal(normalizeRecoveryCode("abcd-efgh-ijk!"), null);
    assert.equal(normalizeRecoveryCode(123), null);
    assert.equal(normalizeRecoveryCode(null), null);
});

test("isRecoveryCodeFormat accepts display and bare forms only", () => {
    assert.equal(isRecoveryCodeFormat("ABCD-EFGH-IJKL"), true);
    assert.equal(isRecoveryCodeFormat("ABCDEFGHIJKL"), true);
    assert.equal(isRecoveryCodeFormat("ABC"), false);
    assert.equal(isRecoveryCodeFormat("123456"), false);
    assert.equal(isRecoveryCodeFormat(""), false);
});

test("matchesRecoveryCode verifies the right code and rejects the rest", () => {
    const set = generateRecoveryCodeSet();
    const first = set[0];
    const bare = first.code.replace(/-/g, "");
    // matchesRecoveryCode takes a database row (snake_case columns).
    const row = (record) => ({ code_hash: record.codeHash, code_salt: record.codeSalt });
    assert.equal(matchesRecoveryCode(bare, row(first)), true);
    assert.equal(matchesRecoveryCode(bare, row(set[1])), false);
    const wrong = bare.slice(0, 11) + (bare[11] === "A" ? "B" : "A");
    assert.equal(matchesRecoveryCode(wrong, first), false);
    // Same stored hash, different salt: the hash is salt-bound, so it
    // must not match.
    assert.equal(matchesRecoveryCode(bare, {
        code_hash: first.codeHash,
        code_salt: "different-salt",
    }), false);
    assert.equal(matchesRecoveryCode(bare, null), false);
    assert.equal(matchesRecoveryCode(bare, {}), false);
});

test("formatRecoveryCode groups twelve bare characters", () => {
    assert.equal(formatRecoveryCode("ABCDEFGHIJKL"), "ABCD-EFGH-IJKL");
});
