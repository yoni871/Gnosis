// Email verification configuration for issue #9.
//
// The Resend API key comes only from RESEND_API_KEY, and verification
// links are built only from FRONTEND_URL. The sender address comes from
// EMAIL_FROM when set, and otherwise falls back to the product identity
// (DEFAULT_EMAIL_FROM, defined once in utils/emailTemplate.js, issue
// #118) — so the sender is a product constant with a per-deployment
// override, not a value each deployment must remember to set. A
// provided-but-invalid EMAIL_FROM still fails validation below.
//
// Validation is centralized here and imported through app.js, because
// Vercel does not run server.js: any serverless wrapper must import the
// exported app, so import-time validation runs on every entry path.
// The validator itself reports fields for unit tests and request-time
// handling, but the startup path maps every failure to the generic
// message (issue #5): startup stderr must never name a variable or
// carry a value.

const { validateEmailAddress } = require("../utils/authValidation");
const { DEFAULT_EMAIL_FROM } = require("../utils/emailTemplate");

const RESEND_API_BASE_URL_DEFAULT = "https://api.resend.com";

function isAbsoluteHttpsUrl(value) {
    if (typeof value !== "string" || value.length === 0) {
        return false;
    }
    let url;
    try {
        url = new URL(value);
    } catch {
        return false;
    }
    return url.protocol === "https:" && url.hostname.length > 0;
}

// Accept "Display Name <address>" or a bare address; validate the
// address part with the same structural rule as issue #3.
function extractEmailAddress(value) {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return null;
    }
    const angled = trimmed.match(/^.*<([^<>]+)>$/);
    return (angled ? angled[1] : trimmed).trim();
}

// Pure validation: returns { config } on success or { errors } listing
// one entry per bad field. Errors name the FIELD only, never the value.
function validateEmailConfig(env = process.env) {
    const errors = [];
    const local = env.NODE_ENV === 'development' && env.GNOSIS_LOCAL_DEV === '1';
    const disabled = ['disabled','mailpit'].includes(env.EMAIL_DELIVERY);
    if (env.EMAIL_DELIVERY === 'mailpit' && !local) errors.push({ field:'EMAIL_DELIVERY', message:'Mailpit is local-only.' });
    if (disabled && !local) errors.push({ field: 'EMAIL_DELIVERY', message: 'Disabled email is local-only.' });
    if (env.EMAIL_DELIVERY && !['disabled', 'resend', 'mailpit'].includes(env.EMAIL_DELIVERY)) {
        errors.push({ field: 'EMAIL_DELIVERY', message: 'Invalid delivery mode.' });
    }
    const resendApiKey = typeof env.RESEND_API_KEY === "string" ? env.RESEND_API_KEY : "";
    if (!disabled && resendApiKey.length === 0) {
        errors.push({ field: "RESEND_API_KEY", message: "RESEND_API_KEY is required." });
    }
    // The sender is the product identity by default (issue #118);
    // EMAIL_FROM overrides it per deployment. An unset or blank
    // EMAIL_FROM falls back to the default; a provided-but-invalid
    // address still fails validation.
    const emailFromRaw = typeof env.EMAIL_FROM === "string" && env.EMAIL_FROM.trim() !== ""
        ? env.EMAIL_FROM
        : DEFAULT_EMAIL_FROM;
    const emailFromAddress = extractEmailAddress(emailFromRaw);
    if (!disabled && (!emailFromAddress || validateEmailAddress(emailFromAddress).error)) {
        errors.push({ field: "EMAIL_FROM", message: "EMAIL_FROM must be a structurally valid email address." });
    }
    const frontendUrlRaw = typeof env.FRONTEND_URL === "string" ? env.FRONTEND_URL : "";
    let localOrigin = false;
    try {
        const url = new URL(frontendUrlRaw);
        localOrigin = local && url.protocol === 'http:'
            && require('./localDevelopment').loopback(url.hostname)
            && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
    } catch { /* Invalid URL handled below. */ }
    if (!isAbsoluteHttpsUrl(frontendUrlRaw) && !localOrigin) {
        errors.push({ field: "FRONTEND_URL", message: "FRONTEND_URL must be an absolute HTTPS URL." });
    }
    if (errors.length > 0) {
        return { errors };
    }
    return {
        config: {
            resendApiKey,
            emailFrom: emailFromRaw.trim(),
            // Trailing slashes are stripped so link building is a single
            // concatenation: frontendUrl + "/verify-email#token=...".
            frontendUrl: frontendUrlRaw.replace(/\/+$/, ""),
        },
    };
}

// Startup entry point: any failure becomes the generic message, exactly
// like the JWT and rate-limit fail-fast checks. Never names a variable
// and never carries a value.
function requireEmailConfig(env = process.env) {
    const result = validateEmailConfig(env);
    if (result.errors) {
        throw new Error("Server configuration error: required server configuration is missing.");
    }
    return result.config;
}

module.exports = {
    validateEmailConfig,
    requireEmailConfig,
    RESEND_API_BASE_URL_DEFAULT,
};
