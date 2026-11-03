const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Explicit isolation also protects direct node --test invocations.
process.env.GNOSIS_TEST_ISOLATION = "1";
process.env.JWT_SECRET = "test-secret";

const {
    validateRegisterInput,
    validateLoginInput,
} = require("../../src/utils/authValidation");

// ---------------------------------------------------------------------------
// Pure validator unit tests: no server, no database, no bcrypt.
// ---------------------------------------------------------------------------

function validRegister(overrides = {}) {
    return {
        firstName: "Test",
        lastName: "User",
        email: "test@example.com",
        password: "a-valid-password",
        ...overrides,
    };
}

function validLogin(overrides = {}) {
    return {
        email: "test@example.com",
        password: "a-valid-password",
        ...overrides,
    };
}

test("validator rejects non-object bodies", () => {
    for (const body of [null, [1, 2], "text", 42, true, undefined]) {
        assert.deepEqual(validateRegisterInput(body), { error: "Request body must be an object." });
        assert.deepEqual(validateLoginInput(body), { error: "Request body must be an object." });
    }
});

test("validator reports fields in order", () => {
    assert.deepEqual(validateRegisterInput({}), { error: "First name is required." });
    assert.deepEqual(
        validateRegisterInput({ firstName: "Test" }),
        { error: "Last name is required." },
    );
    assert.deepEqual(
        validateRegisterInput({ firstName: "Test", lastName: "User" }),
        { error: "Email address is required." },
    );
    assert.deepEqual(validateLoginInput({}), { error: "Email address is required." });
});

test("validator requires names and trims them", () => {
    for (const bad of [undefined, null, 42, {}, "   "]) {
        assert.deepEqual(validateRegisterInput(validRegister({ firstName: bad })), { error: "First name is required." });
        assert.deepEqual(validateRegisterInput(validRegister({ lastName: bad })), { error: "Last name is required." });
    }
    assert.deepEqual(
        validateRegisterInput(validRegister({ firstName: "  Test  ", lastName: "  User " })).value,
        { firstName: "Test", lastName: "User", email: "test@example.com", password: "a-valid-password" },
    );
});

test("validator enforces the 1-100 Unicode character name limits", () => {
    assert.equal(validateRegisterInput(validRegister({ firstName: "n".repeat(100) })).error, undefined);
    assert.deepEqual(
        validateRegisterInput(validRegister({ firstName: "n".repeat(101) })),
        { error: "First name must be at most 100 characters." },
    );
    assert.deepEqual(
        validateRegisterInput(validRegister({ lastName: "n".repeat(101) })),
        { error: "Last name must be at most 100 characters." },
    );
    // Astral characters count once each: 100 emoji pass, 101 fail, even
    // though their UTF-16 length is double.
    assert.equal(validateRegisterInput(validRegister({ firstName: "😀".repeat(100) })).error, undefined);
    assert.deepEqual(
        validateRegisterInput(validRegister({ firstName: "😀".repeat(101) })),
        { error: "First name must be at most 100 characters." },
    );
});

test("validator accepts Unicode names, apostrophes, and hyphens", () => {
    for (const name of ["José", "O'Brien", "Anne-Marie", "Zoë", "Łukasz"]) {
        assert.equal(validateRegisterInput(validRegister({ firstName: name })).error, undefined);
        assert.equal(validateRegisterInput(validRegister({ lastName: name })).error, undefined);
    }
});

test("validator requires and structurally validates email", () => {
    for (const bad of [undefined, null, 42, "   "]) {
        assert.deepEqual(validateRegisterInput(validRegister({ email: bad })), { error: "Email address is required." });
        assert.deepEqual(validateLoginInput(validLogin({ email: bad })), { error: "Email address is required." });
    }
    for (const bad of ["plainaddress", "a@@b.com", "@b.com", "a@", "a@b", "a b@c.com", "a@b .com",
        ".a@b.com", "a.@b.com", "a..b@c.com", "a@.b.com", "a@b.com.", "a@b..com"]) {
        assert.deepEqual(validateRegisterInput(validRegister({ email: bad })), { error: "Email address is invalid." });
        assert.deepEqual(validateLoginInput(validLogin({ email: bad })), { error: "Email address is invalid." });
    }
});

test("validator accepts normal, plus, apostrophe, and mixed-case addresses", () => {
    // Dots inside either part are fine; only leading, trailing, or
    // consecutive dots are rejected.
    for (const good of ["user@example.com", "user+study@example.com", "o'brien@example.com",
        "first.last@example.com", "user@mail.example.com", "Test@Example.COM"]) {
        assert.equal(validateRegisterInput(validRegister({ email: good })).error, undefined);
        assert.equal(validateLoginInput(validLogin({ email: good })).error, undefined);
        assert.equal(validateRegisterInput(validRegister({ email: good })).value.email, good);
    }
});

test("validator trims email but preserves its case", () => {
    assert.deepEqual(
        validateRegisterInput(validRegister({ email: "  test@example.com  " })).value.email,
        "test@example.com",
    );
    // No lowercasing: case-sensitive lookup behavior is unchanged by #3.
    assert.deepEqual(
        validateRegisterInput(validRegister({ email: "Test@Example.COM" })).value.email,
        "Test@Example.COM",
    );
});

test("validator enforces the 254-character email limit", () => {
    const at254 = `${"a".repeat(64)}@${"b".repeat(185)}.com`;
    const at255 = `${"a".repeat(64)}@${"b".repeat(186)}.com`;
    assert.equal(at254.length, 254);
    assert.equal(at255.length, 255);
    assert.equal(validateRegisterInput(validRegister({ email: at254 })).error, undefined);
    assert.deepEqual(
        validateRegisterInput(validRegister({ email: at255 })),
        { error: "Email address must be at most 254 characters." },
    );
});

test("validator enforces registration password length in characters and bytes", () => {
    for (const bad of [undefined, null, 42, "", "1234567"]) {
        const result = validateRegisterInput(validRegister({ password: bad }));
        assert.deepEqual(result, { error: bad === "" || typeof bad !== "string" ? "Password is required." : "Password must be at least 8 characters." });
    }
    assert.equal(validateRegisterInput(validRegister({ password: "12345678" })).error, undefined);
    assert.equal(validateRegisterInput(validRegister({ password: "x".repeat(72) })).error, undefined);
    assert.deepEqual(
        validateRegisterInput(validRegister({ password: "x".repeat(73) })),
        { error: "Password must be at most 72 bytes." },
    );
    // Multibyte characters: 36 "é" are 72 bytes (pass), 37 are 74 (fail),
    // and 7 "é" are 7 characters (fail the 8-character minimum).
    assert.equal(validateRegisterInput(validRegister({ password: "é".repeat(36) })).error, undefined);
    assert.deepEqual(
        validateRegisterInput(validRegister({ password: "é".repeat(37) })),
        { error: "Password must be at most 72 bytes." },
    );
    assert.deepEqual(
        validateRegisterInput(validRegister({ password: "é".repeat(7) })),
        { error: "Password must be at least 8 characters." },
    );
});

test("validator does not trim passwords", () => {
    assert.deepEqual(
        validateRegisterInput(validRegister({ password: "  a-valid-password  " })).value.password,
        "  a-valid-password  ",
    );
});

test("login validator skips the registration minimum but keeps the byte cap", () => {
    // A short pre-existing password is valid input at login.
    assert.equal(validateLoginInput(validLogin({ password: "abc" })).error, undefined);
    for (const bad of [undefined, null, 42, ""]) {
        assert.deepEqual(validateLoginInput(validLogin({ password: bad })), { error: "Password is required." });
    }
    assert.equal(validateLoginInput(validLogin({ password: "x".repeat(72) })).error, undefined);
    assert.deepEqual(
        validateLoginInput(validLogin({ password: "x".repeat(73) })),
        { error: "Password must be at most 72 bytes." },
    );
});

test("validator ignores unknown fields", () => {
    const register = validateRegisterInput(validRegister({ role: "admin" }));
    assert.deepEqual(register.value, {
        firstName: "Test",
        lastName: "User",
        email: "test@example.com",
        password: "a-valid-password",
    });
    const login = validateLoginInput(validLogin({ role: "admin" }));
    assert.deepEqual(login.value, { email: "test@example.com", password: "a-valid-password" });
});

// ---------------------------------------------------------------------------
// Route tests: validation runs before bcrypt and before the database.
// The pool is mocked in memory (no real database connection is attempted)
// and bcrypt calls are counted through delegating mocks, so these tests
// prove ordering: invalid input reaches neither bcrypt nor the database,
// while valid input reaches both with exactly the validated values.
// ---------------------------------------------------------------------------

const app = require("../../src/app");
const pool = require("../../src/db/db");

const realHash = bcrypt.hash;
const realCompare = bcrypt.compare;

// The mock delegates to a per-test behavior so each test controls what
// the "database" does: throw, return rows, or capture arguments.
let queryBehavior = async () => {
    throw Object.assign(new Error("Synthetic database failure"), { code: "ECONNREFUSED" });
};
const queryMock = test.mock.method(pool, "query", (...args) => queryBehavior(...args));
const hashMock = test.mock.method(bcrypt, "hash", (...args) => realHash(...args));
const compareMock = test.mock.method(bcrypt, "compare", (...args) => realCompare(...args));

let server;
let baseUrl;

test.before(async () => {
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    if (server.closeAllConnections) {
        server.closeAllConnections();
    }
    await new Promise((resolve) => server.close(resolve));
    queryMock.mock.restore();
    hashMock.mock.restore();
    compareMock.mock.restore();
    await pool.end();
});

async function request(path, options = {}) {
    const { headers, ...rest } = options;
    const response = await fetch(`${baseUrl}${path}`, {
        ...rest,
        headers: { Connection: "close", ...headers },
    });
    const text = await response.text();
    return {
        response,
        text,
        json: text ? JSON.parse(text) : null,
    };
}

function assertJsonError(result, status, body) {
    assert.equal(result.response.status, status);
    assert.match(result.response.headers.get("content-type") || "", /application\/json/);
    assert.deepEqual(result.json, body);
    assert.ok(!result.text.includes("<!DOCTYPE"), result.text);
    // A real stack frame looks like a newline followed by "at ... (...)";
    // the plain substring " at " also appears in legitimate messages such
    // as "at most", so only the stack-frame shape is rejected here.
    assert.ok(!/\n\s+at\s+\S+\s+\(/.test(result.text), result.text);
}

function callCounts() {
    return {
        query: queryMock.mock.calls.length,
        hash: hashMock.mock.calls.length,
        compare: compareMock.mock.calls.length,
    };
}

async function post(path, body, raw = false) {
    return request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: raw ? body : JSON.stringify(body),
    });
}

// Sends an invalid request and proves it was rejected with the expected
// 400 before any database or bcrypt call: both call counts are unchanged.
async function assertRejected(path, body, expectedError, { raw = false, bcryptMethod = "hash" } = {}) {
    const before = callCounts();
    const result = await post(path, body, raw);
    assertJsonError(result, 400, { error: expectedError, code: "VALIDATION_FAILED" });
    const after = callCounts();
    assert.equal(after.query, before.query, "invalid input must cause zero database calls");
    assert.equal(after[bcryptMethod], before[bcryptMethod], "invalid input must not reach bcrypt");
}

test("register rejects invalid input before bcrypt and the database", async () => {
    queryBehavior = async () => {
        throw Object.assign(new Error("Synthetic database failure"), { code: "ECONNREFUSED" });
    };
    await assertRejected("/api/auth/register",
        validRegister({ password: undefined }), "Password is required.");
    await assertRejected("/api/auth/register",
        validRegister({ email: "not-an-email" }), "Email address is invalid.");
    await assertRejected("/api/auth/register",
        validRegister({ email: "a@.b.com" }), "Email address is invalid.");
    await assertRejected("/api/auth/register",
        validRegister({ lastName: "n".repeat(101) }), "Last name must be at most 100 characters.");
    await assertRejected("/api/auth/register",
        validRegister({ firstName: 42 }), "First name is required.");
    await assertRejected("/api/auth/register",
        "[1, 2]", "Request body must be an object.", { raw: true });
});

test("login rejects invalid input before bcrypt and the database", async () => {
    queryBehavior = async () => {
        throw Object.assign(new Error("Synthetic database failure"), { code: "ECONNREFUSED" });
    };
    await assertRejected("/api/auth/login",
        validLogin({ email: "not-an-email" }), "Email address is invalid.", { bcryptMethod: "compare" });
    await assertRejected("/api/auth/login",
        validLogin({ password: "" }), "Password is required.", { bcryptMethod: "compare" });
    await assertRejected("/api/auth/login",
        validLogin({ password: "x".repeat(73) }), "Password must be at most 72 bytes.", { bcryptMethod: "compare" });
    await assertRejected("/api/auth/login",
        "[1, 2]", "Request body must be an object.", { raw: true, bcryptMethod: "compare" });
});

test("register passes trimmed values to the insert and hashes the password", async () => {
    let captured;
    queryBehavior = async (...args) => {
        captured = args;
        return { rows: [{ id: 7, first_name: "Test", last_name: "User", email: "test@example.com" }] };
    };
    const before = callCounts();
    const result = await post("/api/auth/register", validRegister({
        firstName: "  Test  ",
        lastName: "User ",
        email: "  test@example.com  ",
    }));
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.json, { id: 7, first_name: "Test", last_name: "User", email: "test@example.com" });
    assert.match(captured[0], /INSERT INTO users/);
    assert.equal(captured[1][0], "Test");
    assert.equal(captured[1][1], "User");
    assert.equal(captured[1][2], "test@example.com");
    assert.match(captured[1][3], /^\$2[ab]\$/);
    assert.notEqual(captured[1][3], "a-valid-password");
    assert.equal(callCounts().hash, before.hash + 1, "valid registration must hash exactly once");
});

test("register ignores unknown fields", async () => {
    let captured;
    queryBehavior = async (...args) => {
        captured = args;
        return { rows: [{ id: 7 }] };
    };
    const result = await post("/api/auth/register", validRegister({ role: "admin" }));
    assert.equal(result.response.status, 200);
    assert.equal(captured[1].length, 4, "only the four validated values reach the query");
    assert.ok(!captured[1].includes("admin"));
});

test("register preserves email case in the insert", async () => {
    let captured;
    queryBehavior = async (...args) => {
        captured = args;
        return { rows: [{ id: 7 }] };
    };
    const result = await post("/api/auth/register", validRegister({ email: "Test@Example.COM" }));
    assert.equal(result.response.status, 200);
    assert.equal(captured[1][2], "Test@Example.COM");
});

test("register duplicate email still returns the existing 409", async () => {
    queryBehavior = async () => {
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
    };
    const result = await post("/api/auth/register", validRegister());
    assertJsonError(result, 409, {
        error: "An account with that email already exists.",
        code: "EMAIL_EXISTS",
    });
});

test("login with unknown email and wrong password returns identical 401s", async () => {
    queryBehavior = async () => ({ rows: [] });
    const unknown = await post("/api/auth/login", validLogin());
    assertJsonError(unknown, 401, {
        error: "Invalid email or password.",
        code: "INVALID_CREDENTIALS",
    });

    const passwordHash = await realHash("correct-password", 10);
    queryBehavior = async () => ({
        rows: [{
            id: 42,
            first_name: "Test",
            last_name: "User",
            email: "test@example.com",
            password_hash: passwordHash,
        }],
    });
    const wrong = await post("/api/auth/login", validLogin({ password: "wrong-password" }));
    assertJsonError(wrong, 401, {
        error: "Invalid email or password.",
        code: "INVALID_CREDENTIALS",
    });
    assert.deepEqual(wrong.json, unknown.json);
    assert.equal(wrong.response.status, unknown.response.status);
});

test("login with valid credentials performs real bcrypt comparison and JWT signing", async () => {
    const passwordHash = await realHash("correct-password", 10);
    queryBehavior = async () => ({
        rows: [{
            id: 42,
            first_name: "Test",
            last_name: "User",
            email: "test@example.com",
            password_hash: passwordHash,
        }],
    });
    const before = callCounts();
    const result = await post("/api/auth/login", validLogin({ password: "correct-password" }));
    assert.equal(result.response.status, 200);
    assert.equal(typeof result.json.token, "string");
    const decoded = jwt.verify(result.json.token, process.env.JWT_SECRET);
    assert.equal(decoded.userId, 42);
    assert.equal(callCounts().compare, before.compare + 1, "valid login must compare exactly once");
});

test("login trims the email before lookup", async () => {
    let captured;
    const passwordHash = await realHash("correct-password", 10);
    queryBehavior = async (...args) => {
        captured = args;
        return { rows: [{ id: 42, password_hash: passwordHash }] };
    };
    const result = await post("/api/auth/login", validLogin({
        email: "  test@example.com  ",
        password: "correct-password",
    }));
    assert.equal(result.response.status, 200);
    assert.equal(captured[1][0], "test@example.com");
});

test("login accepts a short pre-existing password", async () => {
    const passwordHash = await realHash("abc", 10);
    queryBehavior = async () => ({
        rows: [{ id: 42, password_hash: passwordHash }],
    });
    const result = await post("/api/auth/login", validLogin({ password: "abc" }));
    assert.equal(result.response.status, 200);
    const decoded = jwt.verify(result.json.token, process.env.JWT_SECRET);
    assert.equal(decoded.userId, 42);
});
