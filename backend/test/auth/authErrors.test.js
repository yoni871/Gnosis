const test = require("node:test");
const assert = require("node:assert/strict");

const {
    resolveAuthError,
    internalErrorBody,
    CLIENT_AUTH_RESPONSES,
    isBodyParseError,
    isBodyTooLarge,
    logAuthFailure,
    logAuthEvent,
} = require("../../src/utils/authErrors");

test("duplicate email on register maps to 409 with the existing message", () => {
    const { status, body } = resolveAuthError({ code: "23505" }, "register");
    assert.equal(status, 409);
    assert.deepEqual(body, {
        error: "An account with that email already exists.",
        code: "EMAIL_EXISTS",
    });
});

test("the same duplicate code on other endpoints is a generic 500, not a 409", () => {
    for (const endpoint of ["login", "profile"]) {
        const { status, body } = resolveAuthError({ code: "23505" }, endpoint);
        assert.equal(status, 500);
        assert.equal(body.code, "INTERNAL_ERROR");
    }
});

test("database failures map to each endpoint's existing generic message", () => {
    assert.deepEqual(resolveAuthError({ code: "ECONNREFUSED" }, "register"), {
        status: 500,
        body: { error: "Can not create an account.", code: "INTERNAL_ERROR" },
    });
    assert.deepEqual(resolveAuthError(new Error("boom"), "login"), {
        status: 500,
        body: { error: "Something went wrong.", code: "INTERNAL_ERROR" },
    });
    assert.deepEqual(resolveAuthError(new Error("boom"), "profile"), {
        status: 500,
        body: { error: "Failed to retrieve profile.", code: "INTERNAL_ERROR" },
    });
});

test("generic internal bodies never carry SQL, stacks, or secrets", () => {
    const nasty = new Error("select * from users where password_hash = 'hunter2'");
    nasty.stack = "Error: boom\n    at /secret/path/server.js:1:1";
    nasty.code = "23505";
    for (const endpoint of ["register", "login", "profile"]) {
        const { body } = resolveAuthError(nasty, endpoint);
        const text = JSON.stringify(body);
        assert.ok(!text.includes("select * from users"), text);
        assert.ok(!text.includes("password_hash"), text);
        assert.ok(!text.includes("hunter2"), text);
        assert.ok(!text.includes("/secret/path"), text);
        assert.deepEqual(Object.keys(body).sort(), ["code", "error"]);
    }
});

test("internalErrorBody keeps each endpoint's wording", () => {
    assert.equal(internalErrorBody("register").error, "Can not create an account.");
    assert.equal(internalErrorBody("login").error, "Something went wrong.");
    assert.equal(internalErrorBody("profile").error, "Failed to retrieve profile.");
    assert.equal(internalErrorBody("register").code, "INTERNAL_ERROR");
});

test("fixed client responses keep the existing messages and statuses", () => {
    assert.deepEqual(CLIENT_AUTH_RESPONSES.tokenRequired, {
        status: 401,
        body: { error: "Access token required.", code: "TOKEN_REQUIRED" },
    });
    assert.deepEqual(CLIENT_AUTH_RESPONSES.tokenInvalid, {
        status: 403,
        body: { error: "Invalid or expired token.", code: "TOKEN_INVALID" },
    });
    assert.deepEqual(CLIENT_AUTH_RESPONSES.invalidBody, {
        status: 400,
        body: { error: "Invalid request body.", code: "INVALID_BODY" },
    });
    assert.deepEqual(CLIENT_AUTH_RESPONSES.internal, {
        status: 500,
        body: { error: "Something went wrong.", code: "INTERNAL_ERROR" },
    });
});

test("isBodyParseError only matches malformed-JSON errors", () => {
    assert.equal(isBodyParseError({ type: "entity.parse.failed" }), true);
    const syntax = new SyntaxError("Unexpected token");
    syntax.status = 400;
    assert.equal(isBodyParseError(syntax), true);
    assert.equal(isBodyParseError({ type: "entity.too.large" }), false);
    assert.equal(isBodyParseError(new Error("boom")), false);
    assert.equal(isBodyParseError(null), false);
});

test("isBodyTooLarge only matches over-limit bodies, which map to 413", () => {
    assert.equal(isBodyTooLarge({ type: "entity.too.large" }), true);
    assert.equal(isBodyTooLarge({ type: "entity.parse.failed" }), false);
    assert.equal(isBodyTooLarge(new Error("boom")), false);
    assert.equal(isBodyTooLarge(null), false);
    assert.deepEqual(CLIENT_AUTH_RESPONSES.bodyTooLarge,
        { status: 413, body: { error: "Request body too large.", code: "BODY_TOO_LARGE" } });
});

test("logAuthFailure never logs messages, stacks, or sensitive values", () => {
    const seen = [];
    const original = console.error;
    console.error = (...args) => {
        seen.push(args.join(" "));
    };
    try {
        const error = new Error("select * from users where password_hash = 'hunter2'");
        error.stack = "Error: boom\n    at /secret/path/server.js:1:1";
        error.code = "23505";
        logAuthFailure("POST /api/auth/login", "database", error);
        logAuthFailure("authMiddleware", "token", null);
    } finally {
        console.error = original;
    }
    const text = seen.join("\n");
    assert.ok(text.includes("POST /api/auth/login"), text);
    assert.ok(text.includes("code=23505"), text);
    assert.ok(!text.includes("select * from users"), text);
    assert.ok(!text.includes("password_hash"), text);
    assert.ok(!text.includes("hunter2"), text);
    assert.ok(!text.includes("/secret/path"), text);
});

test("delete endpoint keeps the generic internal message", () => {
    assert.deepEqual(internalErrorBody("delete"), {
        error: "Something went wrong.",
        code: "INTERNAL_ERROR",
    });
});

test("logAuthEvent logs route and kind only, never user data", () => {
    const seen = [];
    const original = console.error;
    console.error = (...args) => {
        seen.push(args.join(" "));
    };
    try {
        logAuthEvent("DELETE /api/auth/account", "account-deleted");
    } finally {
        console.error = original;
    }
    assert.deepEqual(seen, ["[auth] DELETE /api/auth/account event=account-deleted"]);
});
