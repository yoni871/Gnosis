const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");

// Explicit isolation also protects direct node --test invocations.
process.env.GNOSIS_TEST_ISOLATION = "1";
process.env.JWT_SECRET = "synthetic-test-secret-that-is-long-enough";
process.env.RATE_LIMIT_KEY_SECRET = "synthetic-test-secret-that-is-long-enough";
// Issue #9: app.js validates email configuration at import time.
process.env.RESEND_API_KEY = "re_synthetic_test_key";
process.env.EMAIL_FROM = 'Gnosis Test <test@example.invalid>';
process.env.FRONTEND_URL = 'https://frontend.example.invalid';

const app = require("../../src/app");
const pool = require("../../src/db/db");
const { parsePagination } = require("../../src/utils/pagination");
const { isValidVerseSelection, MAX_HIGHLIGHT_VERSES } = require("../../src/utils/highlightValidation");

let lastListQuery = null;

const NOTE_ROWS = [{ id: 1, user_id: 1, book_id: 2, content: "My note" }];
const BOOKMARK_ROWS = [{ id: 1, user_id: 1, book_id: 2, start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 2 }];
const HIGHLIGHT_ROWS = [{ id: 1, user_id: 1, book_id: 2, chapter: 1, verse: 1, color: "#FFD54F" }];

// In single-database mode the Bible pool is the same instance as the
// application pool, so this one mock answers both sides (same pattern as
// the cross-project validation tests).
const queryMock = test.mock.method(pool, "query", async (sql, params) => {
    if (typeof sql === "string" && sql.includes("FROM auth_sessions")) {
        return { rows: [{ id: "00000000-0000-4000-8000-000000000001" }] };
    }
    if (typeof sql === "string" && sql.includes("SELECT 1 FROM bible_books")) {
        return { rows: [{ "1": 1 }] };
    }
    if (typeof sql === "string" && sql.includes("WHERE id = ANY")) {
        return { rows: [{ id: 2, name: "Exodus", book_order: 2 }] };
    }
    if (typeof sql === "string" && sql.includes("SELECT * FROM notes")) {
        lastListQuery = { sql, params };
        return { rows: NOTE_ROWS };
    }
    if (typeof sql === "string" && sql.includes("FROM bookmarks")) {
        lastListQuery = { sql, params };
        return { rows: BOOKMARK_ROWS };
    }
    if (typeof sql === "string" && sql.includes("FROM highlights")) {
        lastListQuery = { sql, params };
        return { rows: HIGHLIGHT_ROWS };
    }
    if (typeof sql === "string" && sql.includes("INSERT INTO notes")) {
        return { rows: [{ id: 1, user_id: params[0], book_id: params[1], content: params[6] }] };
    }
    if (typeof sql === "string" && sql.includes("UPDATE notes")) {
        return { rows: [{ id: 1, book_id: params[0] ?? 2 }] };
    }
    throw new Error(`Unexpected query in error-budgets test: ${sql}`);
});

let server;
let baseUrl;
let port;

test.before(async () => {
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
    if (server.closeAllConnections) {
        server.closeAllConnections();
    }
    await new Promise((resolve) => server.close(resolve));
    queryMock.mock.restore();
    await pool.end();
});

test.beforeEach(() => {
    lastListQuery = null;
});

function token() {
    return jwt.sign({ userId: 1, sid: "00000000-0000-4000-8000-000000000001" }, process.env.JWT_SECRET,
        { expiresIn: "15m", issuer: "gnosis", audience: "gnosis-api" });
}

// Raw HTTP request: fetch always sets a Content-Type for a string body,
// so only a raw request can send a body with no Content-Type at all.
function rawRequest({ method = "POST", path, body, contentType }) {
    return new Promise((resolve, reject) => {
        const headers = { Connection: "close", Authorization: `Bearer ${token()}` };
        if (contentType !== undefined) headers["Content-Type"] = contentType;
        if (body !== undefined) headers["Content-Length"] = Buffer.byteLength(body);
        const req = http.request({ host: "127.0.0.1", port, path, method, headers, agent: false }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
                const text = Buffer.concat(chunks).toString();
                resolve({ status: res.statusCode, headers: res.headers, json: text ? JSON.parse(text) : null });
            });
        });
        req.on("error", reject);
        req.end(body);
    });
}

async function request(path, options = {}) {
    const { headers, ...rest } = options;
    const response = await fetch(`${baseUrl}${path}`, {
        ...rest,
        headers: { Connection: "close", Authorization: `Bearer ${token()}`, ...headers },
    });
    const text = await response.text();
    return { response, json: text ? JSON.parse(text) : null };
}

const NOTE = { bookId: 2, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 2, content: "My note" };

test("N03: a JSON body with no Content-Type gets a controlled 400, not a 500", async () => {
    for (const contentType of [undefined, "text/plain"]) {
        const result = await rawRequest({ path: "/api/notes", body: JSON.stringify(NOTE), contentType });
        assert.equal(result.status, 400, `Content-Type ${contentType}`);
        assert.deepEqual(result.json, { error: "Note content is required." });
    }
});

test("N04: an oversized JSON body gets a controlled 413", async () => {
    const result = await rawRequest({
        path: "/api/notes",
        body: JSON.stringify({ text: "a".repeat(100 * 1024) }),
        contentType: "application/json",
    });
    assert.equal(result.status, 413);
    assert.deepEqual(result.json, { error: "Request body too large.", code: "BODY_TOO_LARGE" });
});

test("F04: the notes list caps limit at 100 and reports the applied values", async () => {
    const capped = await request("/api/notes?limit=500");
    assert.equal(capped.response.status, 200);
    assert.equal(capped.response.headers.get("x-limit"), "100");
    assert.equal(capped.response.headers.get("x-offset"), "0");
    assert.deepEqual(lastListQuery.params, [1, 100, 0]);
    assert.match(lastListQuery.sql, /LIMIT \$2 OFFSET \$3/);

    const paged = await request("/api/notes?limit=5&offset=10");
    assert.equal(paged.response.status, 200);
    assert.equal(paged.response.headers.get("x-limit"), "5");
    assert.equal(paged.response.headers.get("x-offset"), "10");
    assert.deepEqual(lastListQuery.params, [1, 5, 10]);

    const defaults = await request("/api/notes");
    assert.equal(defaults.response.status, 200);
    assert.equal(defaults.response.headers.get("x-limit"), "100");
    assert.equal(defaults.response.headers.get("x-offset"), "0");
    assert.deepEqual(lastListQuery.params, [1, 100, 0]);
});

test("F04: the bookmarks list caps limit at 100 and reports the applied values", async () => {
    const result = await request("/api/bookmarks?limit=500");
    assert.equal(result.response.status, 200);
    assert.equal(result.response.headers.get("x-limit"), "100");
    assert.equal(result.response.headers.get("x-offset"), "0");
    assert.deepEqual(lastListQuery.params, [1, 100, 0]);
    assert.equal(result.json[0].book, "Exodus");
});

test("F04: the highlights list caps limit at 100 and reports the applied values", async () => {
    const result = await request("/api/highlights?limit=500");
    assert.equal(result.response.status, 200);
    assert.equal(result.response.headers.get("x-limit"), "100");
    assert.equal(result.response.headers.get("x-offset"), "0");
    assert.deepEqual(lastListQuery.params, [1, 100, 0]);
});

test("F04: note content over 100,000 characters is rejected on create and update", async () => {
    const tooLong = { ...NOTE, content: "x".repeat(100_001) };
    const created = await request("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tooLong),
    });
    assert.equal(created.response.status, 400);
    assert.deepEqual(created.json, { error: "Note content is too long." });

    const updated = await request("/api/notes/1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "x".repeat(100_001) }),
    });
    assert.equal(updated.response.status, 400);
    assert.deepEqual(updated.json, { error: "Note content is too long." });

    const atLimit = await request("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...NOTE, content: "x".repeat(100_000) }),
    });
    assert.equal(atLimit.response.status, 201);
    assert.equal(atLimit.json.content.length, 100_000);
});

test("F04: highlight verse selections over 200 are rejected", async () => {
    const verses = Array.from({ length: 201 }, (_, i) => ({ chapter: 1, verse: i + 1 }));
    const result = await request("/api/highlights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: 2, verses, color: "#FFD54F" }),
    });
    assert.equal(result.response.status, 400);
    assert.deepEqual(result.json, { error: "Select at least one valid verse." });
});

test("F04: highlight verse cap is 200 — a full chapter fits", () => {
    assert.equal(MAX_HIGHLIGHT_VERSES, 200);
    const verses = (n) => Array.from({ length: n }, (_, i) => ({ chapter: 1, verse: i + 1 }));
    assert.equal(isValidVerseSelection(verses(200)), true);
    assert.equal(isValidVerseSelection(verses(201)), false);
    assert.equal(isValidVerseSelection([]), false);
    assert.equal(isValidVerseSelection([{ chapter: 0, verse: 1 }]), false);
});

test("F04: parsePagination clamps limit and offset and falls back on bad input", () => {
    assert.deepEqual(parsePagination({}), { limit: 100, offset: 0 });
    assert.deepEqual(parsePagination({ limit: "500", offset: "0" }), { limit: 100, offset: 0 });
    assert.deepEqual(parsePagination({ limit: "5", offset: "10" }), { limit: 5, offset: 10 });
    assert.deepEqual(parsePagination({ limit: "abc", offset: "xyz" }), { limit: 100, offset: 0 });
    assert.deepEqual(parsePagination({ limit: "0", offset: "-5" }), { limit: 100, offset: 0 });
});
