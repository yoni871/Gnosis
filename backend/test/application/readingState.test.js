const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

// Explicit isolation also protects direct node --test invocations.
process.env.GNOSIS_TEST_ISOLATION = "1";
process.env.JWT_SECRET = "test-jwt-secret-synthetic-test-secret";
process.env.RATE_LIMIT_KEY_SECRET = "test-rate-limit-secret-synthetic-test-secret";
// Issue #9: app.js validates email configuration at import time.
process.env.RESEND_API_KEY = "test-resend-key";
process.env.EMAIL_FROM = 'Gnosis Test <test@example.invalid>';
process.env.FRONTEND_URL = 'https://frontend.example.invalid';

const app = require("../../src/app");
const pool = require("../../src/db/db");

// In-memory stand-in for the user_reading_state row, so the upsert and
// the re-select after it observe the same saved position.
let savedRow = null;
let bookExists = true;
let translationExists = true;
let commentaryExists = true;
let lastInsertParams = null;

const queryMock = test.mock.method(pool, "query", async (sql, params) => {
    if (typeof sql === "string" && sql.includes("FROM auth_sessions")) {
        return { rows: [{ id: '00000000-0000-4000-8000-000000000001' }] };
    }
    if (typeof sql === "string" && sql.includes("INSERT INTO user_reading_state")) {
        lastInsertParams = params;
        savedRow = {
            user_id: params[0],
            book_id: params[1],
            chapter_number: params[2],
            translation: params[3],
            commentary_id: params[4],
            verse_number: params[5],
            updated_at: "2026-11-06T19:00:00.000Z",
            book: "Genesis",
        };
        // The upsert returns the saved row (RETURNING *).
        return { rows: [savedRow] };
    }

    if (typeof sql === "string" && sql.includes("FROM user_reading_state")) {
        return { rows: savedRow ? [savedRow] : [] };
    }

    // The PUT validates the book, translation, and commentary one at a
    // time, each against its own project; the book query also returns
    // the book name for the response. The GET looks the book name up
    // the same way. In single-database mode the Bible and Commentary
    // pools are the same instance as the application pool, so this one
    // mock answers all three.
    if (typeof sql === "string" && sql.includes("FROM bible_books")) {
        return { rows: bookExists ? [{ name: "Genesis" }] : [] };
    }
    if (typeof sql === "string" && sql.includes("FROM bible_translations")) {
        return { rows: translationExists ? [{ "1": 1 }] : [] };
    }
    if (typeof sql === "string" && sql.includes("FROM commentaries")) {
        return { rows: commentaryExists ? [{ "1": 1 }] : [] };
    }

    throw new Error(`Unexpected query in reading-state test: ${sql}`);
});

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
    await pool.end();
});

test.beforeEach(() => {
    savedRow = null;
    bookExists = true;
    translationExists = true;
    commentaryExists = true;
    lastInsertParams = null;
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

const FULL_POSITION = {
    bookId: 2,
    chapter: 1,
    translation: "ESV",
    commentaryId: 3,
    verse: 5,
};

test("GET /api/reading-state requires a token", async () => {
    const { response } = await request("/api/reading-state");
    assert.equal(response.status, 401);
});

test("GET /api/reading-state returns 404 when nothing is saved", async () => {
    const { response, json } = await request("/api/reading-state", {
        headers: { Authorization: `Bearer ${token()}` },
    });
    assert.equal(response.status, 404);
    assert.equal(json.error, "No saved reading position.");
});

test("GET /api/reading-state returns the saved position with the book name", async () => {
    savedRow = {
        user_id: 1,
        book_id: 2,
        chapter_number: 1,
        translation: "ESV",
        commentary_id: 3,
        verse_number: 5,
        updated_at: "2026-11-06T19:00:00.000Z",
        book: "Genesis",
    };

    const { response, json } = await request("/api/reading-state", {
        headers: { Authorization: `Bearer ${token()}` },
    });
    assert.equal(response.status, 200);
    assert.equal(json.book, "Genesis");
    assert.equal(json.chapter_number, 1);
    assert.equal(json.translation, "ESV");
    assert.equal(json.commentary_id, 3);
    assert.equal(json.verse_number, 5);
});

test("PUT /api/reading-state requires a token", async () => {
    const { response } = await request("/api/reading-state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(FULL_POSITION),
    });
    assert.equal(response.status, 401);
});

test("PUT /api/reading-state rejects an invalid token", async () => {
    const { response } = await request("/api/reading-state", {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer not-a-token",
        },
        body: JSON.stringify(FULL_POSITION),
    });
    assert.equal(response.status, 403);
});

test("PUT /api/reading-state rejects a missing translation", async () => {
    const { response, json } = await request("/api/reading-state", {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({ bookId: 2, chapter: 1 }),
    });
    assert.equal(response.status, 400);
    assert.equal(json.error, "Book, chapter, and translation are required.");
});

test("PUT /api/reading-state rejects a non-positive chapter", async () => {
    const { response, json } = await request("/api/reading-state", {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({ ...FULL_POSITION, chapter: 0 }),
    });
    assert.equal(response.status, 400);
    assert.equal(json.error, "The reading position is invalid.");
});

test("PUT /api/reading-state rejects an unknown book", async () => {
    bookExists = false;

    const { response, json } = await request("/api/reading-state", {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(FULL_POSITION),
    });
    assert.equal(response.status, 400);
    assert.equal(json.error, "The book does not exist.");
});

test("PUT /api/reading-state rejects an unknown translation", async () => {
    translationExists = false;

    const { response, json } = await request("/api/reading-state", {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(FULL_POSITION),
    });
    assert.equal(response.status, 400);
    assert.equal(json.error, "The translation does not exist.");
});

test("PUT /api/reading-state rejects an unknown commentary", async () => {
    commentaryExists = false;

    const { response, json } = await request("/api/reading-state", {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(FULL_POSITION),
    });
    assert.equal(response.status, 400);
    assert.equal(json.error, "The commentary does not exist.");
});

test("PUT /api/reading-state upserts the position and returns it", async () => {
    const { response, json } = await request("/api/reading-state", {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(FULL_POSITION),
    });
    assert.equal(response.status, 200);
    assert.equal(json.book, "Genesis");
    assert.equal(json.translation, "ESV");
    assert.equal(json.verse_number, 5);
    assert.deepEqual(lastInsertParams, [1, 2, 1, "ESV", 3, 5]);
});

test("PUT /api/reading-state stores nulls when commentary and verse are omitted", async () => {
    const { response, json } = await request("/api/reading-state", {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
            bookId: 2,
            chapter: 1,
            translation: "KJV",
        }),
    });
    assert.equal(response.status, 200);
    assert.equal(json.commentary_id, null);
    assert.equal(json.verse_number, null);
    assert.deepEqual(lastInsertParams, [1, 2, 1, "KJV", null, null]);
});
