// Shared authentication error handling for issue #5, extended by the
// log-hygiene work (audit F02, roadmap T1.4) with the shared
// allowlisted server-side logger used outside auth as well.
//
// This module is intentionally dependency-free and pure, so it can be tested
// with Node's built-in test runner without a database or any other service.
//
// Two rules shape everything here:
// 1. Clients only ever see controlled messages. Nothing from a database,
//    password-hashing, or JWT failure is copied into a response.
// 2. Server logs carry route, failure kind, and database code only. They
//    never carry request data, tokens, hashes, passwords, connection
//    strings, secrets, error messages, or stack traces.
//
// There is no correlation id in the application today, so none is
// logged. Do not invent one here; if request ids are added later, they
// may be appended to the allowlist by a separate change.

const ENDPOINT_MESSAGES = {
    register: "Can not create an account.",
    login: "Something went wrong.",
    profile: "Failed to retrieve profile.",
    // Issue #9: verification endpoints share the generic wording. Their
    // client-visible failures are the controlled 400/403/429 bodies, never
    // these internal messages.
    verify: "Something went wrong.",
    resend: "Something went wrong.",
    // Issue #10: the reset endpoints share the same generic wording.
    // Their client-visible failures are the controlled 400/429 bodies,
    // never these internal messages.
    forgot: "Something went wrong.",
    reset: "Something went wrong.",
    // Account deletion shares the same generic wording.
    delete: "Something went wrong.",
    // TOTP MFA: the MFA endpoints share the same generic wording.
    mfa: "Something went wrong.",
};

function errorBody(message, code) {
    return { error: message, code };
}

// Generic internal-error body for one auth endpoint, using that endpoint's
// existing wording so successful-path behavior and messages do not change.
function internalErrorBody(endpoint) {
    return errorBody(ENDPOINT_MESSAGES[endpoint] || ENDPOINT_MESSAGES.login, "INTERNAL_ERROR");
}

// Map a database failure to the controlled response for one auth endpoint.
// Only the register duplicate-email case (PostgreSQL 23505) is a client
// error with a specific message; every other database failure is an
// internal error with the endpoint's generic message. Invalid input is
// rejected with a 400 by issue #3 validation before any database access,
// so only genuine database failures reach this mapping.
function resolveAuthError(error, endpoint) {
    if (endpoint === "register" && error && error.code === "23505") {
        return {
            status: 409,
            body: errorBody("An account with that email already exists.", "EMAIL_EXISTS"),
        };
    }
    return {
        status: 500,
        body: internalErrorBody(endpoint),
    };
}

// Fixed client-error and fallback responses. The `error` field is kept for
// frontend compatibility (the frontend throws and displays `data.error`);
// `code` is additive and ignored by the current frontend.
const CLIENT_AUTH_RESPONSES = {
    tokenRequired: { status: 401, body: errorBody("Access token required.", "TOKEN_REQUIRED") },
    tokenInvalid: { status: 403, body: errorBody("Invalid or expired token.", "TOKEN_INVALID") },
    invalidBody: { status: 400, body: errorBody("Invalid request body.", "INVALID_BODY") },
    // Audit N05: unmatched /api/* routes return this controlled JSON 404,
    // not Express's default HTML "Cannot GET ..." page.
    notFound: { status: 404, body: errorBody("Not found.", "NOT_FOUND") },
    // N04: an over-limit body is a client error with its own status, not
    // an internal failure. Same { error, code } shape as every other
    // controlled body error.
    bodyTooLarge: { status: 413, body: errorBody("Request body too large.", "BODY_TOO_LARGE") },
    internal: { status: 500, body: errorBody("Something went wrong.", "INTERNAL_ERROR") },
};

// Body-parser reports malformed JSON as a SyntaxError with status 400 and
// type "entity.parse.failed".
function isBodyParseError(error) {
    return Boolean(error) && (error.type === "entity.parse.failed" || (error instanceof SyntaxError && error.status === 400));
}

// Body-parser reports an over-limit body as an error with type
// "entity.too.large" and status 413. It was previously missed here, so
// the central handler converted it to a generic 500 (N04).
function isBodyTooLarge(error) {
    return Boolean(error) && error.type === "entity.too.large";
}

// Log useful server-side context without sensitive data. Only the route,
// the failure kind, and the database code (when present) are recorded.
// error.message and error.stack are deliberately never logged: database
// messages can embed submitted values, and stacks can embed internals.
function logAuthFailure(route, kind, error) {
    const code = error && typeof error.code === "string" ? error.code : "none";
    console.error(`[auth] ${route} failed kind=${kind} code=${code}`);
}

// Shared allowlisted logger for request paths outside auth (audit F02).
// The same discipline as logAuthFailure: only the route, the failure
// kind, and the safe PostgreSQL error code are recorded. The code is the
// only error-derived value that is safe to log — it is a short fixed
// token (for example "23505"), never user-controlled text. Everything
// else on the error (message, stack, query, parameters) is ignored, so
// a database error carrying private note/highlight content cannot leak
// it into Vercel/forwarded logs. Every call site still logs one line
// per failure, so failures stay observable.
function logControllerError(route, kind, error) {
    const code = error && typeof error.code === "string" ? error.code : "none";
    console.error(`[app] ${route} failed kind=${kind} code=${code}`);
}

// Log one idle-connection pool failure (db.js pool "error" handler).
// The pool error has no request route, so only the subsystem and the
// safe code are recorded — never the connection string or the message.
function logPoolError(error) {
    const code = error && typeof error.code === "string" ? error.code : "none";
    console.error(`[db] pool error code=${code}`);
}

// Log a completed security-relevant event the same allowlisted way:
// route + kind only, never a user identifier, email, token, or request
// data. This is a stopgap until the audit-logging track's audit()
// helper lands (branch security/audit-logging): events logged here
// must be re-emitted through audit() once this code rebases onto it,
// and this helper must not grow a second event vocabulary of its own.
function logAuthEvent(route, kind) {
    console.error(`[auth] ${route} event=${kind}`);
}

module.exports = {
    resolveAuthError,
    internalErrorBody,
    CLIENT_AUTH_RESPONSES,
    isBodyParseError,
    isBodyTooLarge,
    logAuthFailure,
    logControllerError,
    logPoolError,
    logAuthEvent,
};
