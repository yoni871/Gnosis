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
//   no whitespace, and no leading, trailing, or consecutive dots in
//   either part). It is NOT lowercased, and lookup stays case-sensitive;
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

// Issue #10: the reset-token format gate lives in the token module, so
// this file stays dependency-free apart from that pure helper.
const { isValidPasswordResetTokenFormat } = require("./passwordReset");

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
    const local = parts[0];
    const domain = parts[1];
    // Dot placement is structural, not full RFC parsing: a dot may appear
    // inside either part, but never at its start or end, and never twice
    // in a row. These checks run on top of the shape checks above. The
    // parts-length guard comes first: without "@", there is no domain to
    // inspect, and short-circuiting must not touch it.
    const dotPlacementValid = parts.length === 2
        && !local.startsWith(".")
        && !local.endsWith(".")
        && !local.includes("..")
        && !domain.startsWith(".")
        && !domain.endsWith(".")
        && !domain.includes("..");
    const structurallyValid = parts.length === 2
        && local.length > 0
        && domain.length > 0
        && domain.includes(".")
        && !/\s/.test(trimmed)
        && dotPlacementValid;
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

// Issue #10: forgot-password takes only an email, verified with the
// same structural rule as registration and resend.
function validateForgotPasswordInput(body) {
    if (!isObjectBody(body)) {
        return { error: "Request body must be an object." };
    }
    const email = validateEmail(body.email);
    if (email.error) return email;
    return {
        value: {
            email: email.value,
        },
    };
}

// Issue #10: reset-password takes a token and a new password. The new
// password follows the registration-strength rule (at least 8
// characters, at most 72 UTF-8 bytes): a reset password is a new
// account password, not a login of an existing one. A malformed token
// is a validation failure (400, no quota consumed); a well-formed but
// invalid token is a generic 400 from the route.
function validateResetPasswordInput(body) {
    if (!isObjectBody(body)) {
        return { error: "Request body must be an object." };
    }
    if (!isValidPasswordResetTokenFormat(body.token)) {
        return { error: "Password reset token is invalid." };
    }
    const password = validateRegisterPassword(body.password);
    if (password.error) return password;
    return {
        value: {
            token: body.token,
            password: password.value,
        },
    };
}

// Authenticated password change: the current password follows the
// login rule (non-empty, at most 72 UTF-8 bytes — the registration
// minimum is deliberately NOT enforced, so accounts created before
// this validation keep working), and the new password follows the
// registration-strength rule (at least 8 characters at this base; the
// rebase onto PR #81 raises the floor to 12 and adds HIBP
// breached-password screening). Validation runs before the limiter, so
// invalid input never counts.
function validateChangePasswordInput(body) {
    if (!isObjectBody(body)) {
        return { error: "Request body must be an object." };
    }
    if (typeof body.currentPassword !== "string" || body.currentPassword.length === 0) {
        return { error: "Current password is required." };
    }
    if (Buffer.byteLength(body.currentPassword, "utf8") > MAX_PASSWORD_BYTES) {
        return { error: `Current password must be at most ${MAX_PASSWORD_BYTES} bytes.` };
    }
    const password = validateRegisterPassword(body.newPassword);
    if (password.error) return password;
    return {
        value: {
            currentPassword: body.currentPassword,
            newPassword: password.value,
        },
    };
}

module.exports = {
    validateRegisterInput,
    validateLoginInput,
    validateForgotPasswordInput,
    validateResetPasswordInput,
    validateChangePasswordInput,
    // Issue #9 reuses the same structural email rule for resend requests
    // and for EMAIL_FROM validation, so "structurally valid" means the
    // same thing everywhere. It never echoes the submitted value.
    validateEmailAddress: validateEmail,
    VALIDATION_CODE,
};
