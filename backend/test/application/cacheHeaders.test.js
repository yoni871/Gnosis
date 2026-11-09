const test = require("node:test");
const assert = require("node:assert/strict");

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

// Regression: the edge-cache headers from the performance work must
// stay wired to the right endpoints. Reference data (books,
// translations, commentaries, sources) is public and changes only on
// deploy or import, so the edge may serve it for an hour; search
// results are public too but cached for five minutes, so a fresh import
// shows up quickly. Authenticated, user-specific responses must never
// carry a public cache header — otherwise one user's reading state,
// notes, bookmarks, highlights, or profile could be served to another
// user from the edge.
const REFERENCE_CACHE = "public, max-age=60, s-maxage=3600, stale-while-revalidate=300";
const SEARCH_CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=60";

// The cached endpoints only need their rows to answer 200; the
// personalized endpoints 401 before any query, so no query ever runs.
const queryMock = test.mock.method(pool, "query", (sql, params, callback) => {
    const finish = () => {
        if (typeof sql === "string" && sql.includes("FROM bible_verses")) {
            // COUNT(*) OVER() arrives as a bigint string from pg.
            return { rows: [{
                text: "Synthetic verse about the Lord",
                verse_number: 1,
                chapter_number: 1,
                book: "Genesis",
                translation: "BSB",
                total: "1",
            }] };
        }
        if (typeof sql === "string" && sql.includes("FROM commentary_entries")) {
            return { rows: [{ id: 1, excerpt: "synthetic commentary" }] };
        }
        return { rows: [] };
    };
    if (typeof callback === "function") {
        queueMicrotask(() => callback(null, finish()));
        return undefined;
    }
    return Promise.resolve(finish());
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

async function get(path) {
    const response = await fetch(`${baseUrl}${path}`, {
        headers: { Connection: "close" },
    });
    return response;
}

test("reference endpoints carry the reference cache header", async () => {
    for (const path of ["/api/books", "/api/translations", "/api/commentaries", "/api/sources"]) {
        const response = await get(path);
        assert.equal(response.status, 200, path);
        assert.equal(response.headers.get("cache-control"), REFERENCE_CACHE, path);
    }
});

test("search endpoints carry the shorter search cache header", async () => {
    for (const path of ["/api/search/bible?q=lord", "/api/search/commentary?q=lord"]) {
        const response = await get(path);
        assert.equal(response.status, 200, path);
        assert.equal(response.headers.get("cache-control"), SEARCH_CACHE, path);
    }
});

test("authenticated and personalized endpoints carry no public cache header", async () => {
    for (const path of ["/api/reading-state", "/api/notes", "/api/bookmarks", "/api/highlights", "/api/auth/profile"]) {
        const response = await get(path);
        assert.equal(response.status, 401, path);
        const header = response.headers.get("cache-control");
        assert.ok(header === null || !header.includes("public"), `${path} must not be publicly cacheable (got: ${header})`);
    }
});
