const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

// Explicit isolation also protects direct node --test invocations.
process.env.GNOSIS_TEST_ISOLATION = "1";
process.env.JWT_SECRET = "synthetic-test-jwt-secret";
process.env.RATE_LIMIT_KEY_SECRET = "synthetic-test-rate-limit-secret";
// Issue #9: app.js validates email configuration at import time.
process.env.RESEND_API_KEY = "re_synthetic_test_key";
process.env.EMAIL_FROM = 'Gnosis Test <test@example.invalid>';
process.env.FRONTEND_URL = 'https://frontend.example.invalid';

const app = require("../../src/app");
const pool = require("../../src/db/db");

// notes, bookmarks and highlights keep book_id as a plain integer: no
// foreign key crosses the project boundary, so the writers validate the
// book against the Bible project before writing. In single-database mode
// the Bible pool is the same instance as the application pool, so this
// one mock answers both sides.
let bookExists = true;
let inserted = null;

const queryMock = test.mock.method(pool, "query", async (sql, params) => {
    if (typeof sql === "string" && sql.includes("FROM auth_sessions")) {
        return { rows: [{ id: '00000000-0000-4000-8000-000000000001' }] };
    }
    if (typeof sql === "string" && sql.includes("FROM bible_books")) {
        return { rows: bookExists ? [{ "1": 1 }] : [] };
    }
    if (typeof sql === "string" && sql.includes("FROM bookmarks")) {
        return { rows: [{ id: 1, user_id: 1, book_id: 2, start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 2 }] };
    }
    if (typeof sql === "string" && sql.includes("INSERT INTO notes")) {
        inserted = { id: 1, user_id: params[0], book_id: params[1], content: params[6] };
        return { rows: [inserted] };
    }
    if (typeof sql === "string" && sql.includes("INSERT INTO bookmarks")) {
        inserted = { id: 1, user_id: params[0], book_id: params[1] };
        return { rows: [inserted] };
    }
    if (typeof sql === "string" && sql.includes("UPDATE notes")) {
        return { rows: [{ id: 1, book_id: params[0] }] };
    }
    if (typeof sql === "string" && sql.includes("UPDATE bookmarks")) {
        return { rows: [{ id: 1, book_id: params[0] }] };
    }
    throw new Error(`Unexpected query in cross-project validation test: ${sql}`);
});

let server;
let baseUrl;

// withUser borrows one pooled client per request; the stand-in client
// answers transaction control and the set_config call itself and
// delegates every other query to the query mock above.
const connectMock = test.mock.method(pool, "connect", async () => ({
    query: async (sql, params) => {
        if (typeof sql === "string" && /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;?\s*$/i.test(sql)) return { rows: [] };
        if (typeof sql === "string" && sql.includes("set_config")) return { rows: [{ set_config: "1" }] };
        return queryMock(sql, params);
    },
    release: () => {},
}));

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
    connectMock.mock.restore();
    await pool.end();
});

test.beforeEach(() => {
    bookExists = true;
    inserted = null;
});

function token() {
    return jwt.sign({ userId: 1, sid: '00000000-0000-4000-8000-000000000001' }, process.env.JWT_SECRET,
        { expiresIn: '15m', issuer: 'gnosis', audience: 'gnosis-api' });
}

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

const NOTE = { bookId: 2, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 2, content: "My note" };
const BOOKMARK = { bookId: 2, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 2 };

test("POST /api/notes rejects an unknown book and writes nothing", async () => {
    bookExists = false;
    const { response, json } = await request("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(NOTE),
    });
    assert.equal(response.status, 400);
    assert.equal(json.error, "Unknown book.");
    assert.equal(inserted, null);
});

test("POST /api/notes writes when the book exists", async () => {
    const { response, json } = await request("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(NOTE),
    });
    assert.equal(response.status, 201);
    assert.equal(json.book_id, 2);
    assert.equal(inserted.book_id, 2);
});

test("PATCH /api/notes/:id rejects an unknown book", async () => {
    bookExists = false;
    const { response, json } = await request("/api/notes/1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ bookId: 999 }),
    });
    assert.equal(response.status, 400);
    assert.equal(json.error, "Unknown book.");
});

test("POST /api/bookmarks rejects an unknown book and writes nothing", async () => {
    bookExists = false;
    const { response, json } = await request("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(BOOKMARK),
    });
    assert.equal(response.status, 400);
    assert.equal(json.error, "Unknown book.");
    assert.equal(inserted, null);
});

test("POST /api/bookmarks writes when the book exists", async () => {
    const { response, json } = await request("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(BOOKMARK),
    });
    assert.equal(response.status, 201);
    assert.equal(json.book_id, 2);
    assert.equal(inserted.book_id, 2);
});

test("PUT /api/bookmarks/:id rejects an unknown book", async () => {
    bookExists = false;
    const { response, json } = await request("/api/bookmarks/1", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(BOOKMARK),
    });
    assert.equal(response.status, 400);
    assert.equal(json.error, "Unknown book.");
});

test("GET /api/bookmarks/:id returns 404 when the bookmark's book is missing", async () => {
    // The bookmark row exists, but its book is gone from the Bible
    // project: the old join returned no row, so this is a 404, not a
    // 200 with an empty body.
    bookExists = false;
    const { response, json } = await request("/api/bookmarks/1", {
        headers: { Authorization: `Bearer ${token()}` },
    });
    assert.equal(response.status, 404);
    assert.equal(json.error, "Bookmark not found.");
});
