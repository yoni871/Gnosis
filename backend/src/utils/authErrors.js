// Shared authentication error handling for issue #5.
//
// This module is intentionally dependency-free and pure, so it can be tested
// with Node's built-in test runner without a database or any other service.
//
// Two rules shape everything here:
// 1. Clients only ever see controlled messages. Nothing from a database,
//    bcrypt, or JWT failure is copied into a response.
// 2. Server logs carry route, failure kind, and database code only. They
//    never carry request data, tokens, hashes, passwords, connection
//    strings, secrets, error messages, or stack traces.

const ENDPOINT_MESSAGES = {
    register: "Can not create an account.",
    login: "Something went wrong.",
    profile: "Failed to retrieve profile.",
    // Issue #9: verification endpoints share the generic wording. Their
    // client-visible failures are the controlled 400/403/429 bodies, never
    // these internal messages.
    verify: "Something went wrong.",
    resend: "Something went wrong.",
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
    internal: { status: 500, body: errorBody("Something went wrong.", "INTERNAL_ERROR") },
};

// Body-parser reports malformed JSON as a SyntaxError with status 400 and
// type "entity.parse.failed".
function isBodyParseError(error) {
    return Boolean(error) && (error.type === "entity.parse.failed" || (error instanceof SyntaxError && error.status === 400));
}

// Log useful server-side context without sensitive data. Only the route,
// the failure kind, and the database code (when present) are recorded.
// error.message and error.stack are deliberately never logged: database
// messages can embed submitted values, and stacks can embed internals.
function logAuthFailure(route, kind, error) {
    const code = error && typeof error.code === "string" ? error.code : "none";
    console.error(`[auth] ${route} failed kind=${kind} code=${code}`);
}

module.exports = {
    resolveAuthError,
    internalErrorBody,
    CLIENT_AUTH_RESPONSES,
    isBodyParseError,
    logAuthFailure,
};
