// Recovery codes for roadmap T2.2.
//
// Ten single-use codes per enrollment, shown exactly once (at
// enrollment or regeneration) and stored only as salted hashes.
// Hash choice: SHA-256 with a per-code random 16-byte salt, NOT
// bcrypt. Verification scans up to ten unused candidate hashes, and
// bcrypt would make one login attempt take seconds; SHA-256 keeps it
// milliseconds. That is safe here because each code carries ~59.5 bits
// of entropy (12 characters from a 31-character alphabet, ambiguous
// characters removed), single use, and rate-limited verification —
// offline brute force of a leaked hash is infeasible at that entropy,
// and a used code can never be replayed. The plaintext code never
// reaches the database and is never logged.
//
// Code format: 12 characters, displayed grouped as XXXX-XXXX-XXXX
// for readability. Dashes are display only; storage and comparison
// use the 12 bare characters, uppercased.

const crypto = require("node:crypto");

const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_LENGTH = 12;
// No 0/O, 1/I/L: typed from a printed list, so lookalikes are excluded.
const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RECOVERY_CODE_DISPLAY_PATTERN = /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/;
const RECOVERY_CODE_BARE_PATTERN = /^[A-Za-z0-9]{12}$/;

function formatRecoveryCode(bare) {
    return `${bare.slice(0, 4)}-${bare.slice(4, 8)}-${bare.slice(8, 12)}`;
}

// Normalize user input: strip dashes and spaces, uppercase. Returns
// the 12 bare characters, or null when the shape is not a code at all.
function normalizeRecoveryCode(value) {
    if (typeof value !== "string") {
        return null;
    }
    const bare = value.replace(/[-\s]/g, "").toUpperCase();
    return RECOVERY_CODE_BARE_PATTERN.test(bare) ? bare : null;
}

function isRecoveryCodeFormat(value) {
    return typeof value === "string"
        && (RECOVERY_CODE_DISPLAY_PATTERN.test(value) || RECOVERY_CODE_BARE_PATTERN.test(value));
}

function generateRecoveryCode() {
    const bytes = crypto.randomBytes(RECOVERY_CODE_LENGTH);
    let bare = "";
    for (const byte of bytes) {
        bare += RECOVERY_CODE_ALPHABET[byte % RECOVERY_CODE_ALPHABET.length];
    }
    return bare;
}

// One fresh code with its salted hash, ready to store. The returned
// `code` is the display form shown once to the user; `codeHash` and
// `codeSalt` are what the database keeps.
function generateRecoveryCodeRecord() {
    const bare = generateRecoveryCode();
    const salt = crypto.randomBytes(16).toString("hex");
    const codeHash = hashRecoveryCode(bare, salt);
    return { code: formatRecoveryCode(bare), codeHash, codeSalt: salt };
}

function generateRecoveryCodeSet() {
    const records = [];
    const seen = new Set();
    while (records.length < RECOVERY_CODE_COUNT) {
        const record = generateRecoveryCodeRecord();
        if (seen.has(record.code)) {
            continue;
        }
        seen.add(record.code);
        records.push(record);
    }
    return records;
}

function hashRecoveryCode(bareCode, salt) {
    return crypto.createHash("sha256").update(salt, "utf8").update(bareCode, "utf8").digest("hex");
}

// Constant-time comparison of one candidate row against the submitted
// code. Returns true only for an exact match.
function matchesRecoveryCode(bareCode, row) {
    if (!row || typeof row.code_hash !== "string" || typeof row.code_salt !== "string") {
        return false;
    }
    const expected = Buffer.from(row.code_hash, "hex");
    const actual = Buffer.from(hashRecoveryCode(bareCode, row.code_salt), "hex");
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

module.exports = {
    RECOVERY_CODE_COUNT,
    RECOVERY_CODE_LENGTH,
    formatRecoveryCode,
    normalizeRecoveryCode,
    isRecoveryCodeFormat,
    generateRecoveryCodeRecord,
    generateRecoveryCodeSet,
    hashRecoveryCode,
    matchesRecoveryCode,
};
