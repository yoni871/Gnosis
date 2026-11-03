// Server-side input validation for issue #3.
//
// This module is intentionally dependency-free and pure: it never touches
// the database, bcrypt, JWT, logs, or the network, and it never echoes a
// submitted value. Routes call it first, before any hashing or query, and
// only the returned `value` (never the raw body) reaches bcrypt or the
// database. Unknown fields are ignored: only known fields are read.
//
// Approved rules for issue #3:
// - The body must be a JSON object. Arrays, strings, numbers, booleans,
//   and null are rejected.
// - First/last names: required strings, trimmed, 1-100 Unicode characters
//   (counted in code points, so astral characters count once). There is
//   no character allowlist: Unicode letters, apostrophes, and hyphens
//   are all accepted.
// - Email: required string, trimmed, at most 254 characters, structurally
//   valid (one "@", non-empty local part and domain, a dot in the domain,
//   no whitespace). It is NOT lowercased, and lookup stays case-sensitive;
//   canonicalization is a separate follow-up migration task.
// - Registration password: required string, at least 8 characters
//   (code points), at most 72 UTF-8 bytes (bcrypt's limit: longer inputs
//   would be silently truncated). No complexity rules. Passwords are not
//   trimmed: spaces can be part of a password.
// - Login password: required non-empty string, at most 72 UTF-8 bytes.
//   The registration minimum is deliberately NOT enforced here, so
//   accounts created before this validation keep working.

const VALIDATION_CODE = "VALIDATION_FAILED";
const MAX_NAME_CHARS = 100;
const MAX_EMAIL_CHARS = 254;
const MIN_REGISTER_PASSWORD_CHARS = 8;
const MAX_PASSWORD_BYTES = 72;

function isObjectBody(body) {
    return body !== null && typeof body === "object" && !Array.isArray(body);
}

// Unicode characters, not UTF-16 code units: an astral character counts
// once, which is what "1-100 characters" means for names and passwords.
function charCount(value) {
    return [...value].length;
}

function trimmedString(value) {
    return typeof value === "string" ? value.trim() : null;
}

// Each validator returns { value } on success or { error } on the first
// failure. Messages name the field and the problem only; they never
// include the submitted value.
function validateName(label, value) {
    const trimmed = trimmedString(value);
    if (trimmed === null || trimmed.length === 0) {
        return { error: `${label} is required.` };
    }
    if (charCount(trimmed) > MAX_NAME_CHARS) {
        return { error: `${label} must be at most ${MAX_NAME_CHARS} characters.` };
    }
    return { value: trimmed };
}

function validateEmail(value) {
    const trimmed = trimmedString(value);
    if (trimmed === null || trimmed.length === 0) {
        return { error: "Email address is required." };
    }
    // String length is a conservative upper bound on character count, so
    // an overlong address can never reach the VARCHAR(255) column.
    if (trimmed.length > MAX_EMAIL_CHARS) {
        return { error: `Email address must be at most ${MAX_EMAIL_CHARS} characters.` };
    }
    const parts = trimmed.split("@");
    const structurallyValid = parts.length === 2
        && parts[0].length > 0
        && parts[1].length > 0
        && parts[1].includes(".")
        && !/\s/.test(trimmed);
    if (!structurallyValid) {
        return { error: "Email address is invalid." };
    }
    return { value: trimmed };
}

function validateRegisterPassword(value) {
    if (typeof value !== "string" || value.length === 0) {
        return { error: "Password is required." };
    }
    if (charCount(value) < MIN_REGISTER_PASSWORD_CHARS) {
        return { error: `Password must be at least ${MIN_REGISTER_PASSWORD_CHARS} characters.` };
    }
    if (Buffer.byteLength(value, "utf8") > MAX_PASSWORD_BYTES) {
        return { error: `Password must be at most ${MAX_PASSWORD_BYTES} bytes.` };
    }
    return { value };
}

function validateLoginPassword(value) {
    if (typeof value !== "string" || value.length === 0) {
        return { error: "Password is required." };
    }
    if (Buffer.byteLength(value, "utf8") > MAX_PASSWORD_BYTES) {
        return { error: `Password must be at most ${MAX_PASSWORD_BYTES} bytes.` };
    }
    return { value };
}

function validateRegisterInput(body) {
    if (!isObjectBody(body)) {
        return { error: "Request body must be an object." };
    }
    const firstName = validateName("First name", body.firstName);
    if (firstName.error) return firstName;
    const lastName = validateName("Last name", body.lastName);
    if (lastName.error) return lastName;
    const email = validateEmail(body.email);
    if (email.error) return email;
    const password = validateRegisterPassword(body.password);
    if (password.error) return password;
    return {
        value: {
            firstName: firstName.value,
            lastName: lastName.value,
            email: email.value,
            password: password.value,
        },
    };
}

function validateLoginInput(body) {
    if (!isObjectBody(body)) {
        return { error: "Request body must be an object." };
    }
    const email = validateEmail(body.email);
    if (email.error) return email;
    const password = validateLoginPassword(body.password);
    if (password.error) return password;
    return {
        value: {
            email: email.value,
            password: password.value,
        },
    };
}

module.exports = {
    validateRegisterInput,
    validateLoginInput,
    VALIDATION_CODE,
};
