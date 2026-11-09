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

// A synthetic ranked set of 250 matching verses, in the exact order the
// route must page through: rank groups share one rank (ties are the
// norm for a common word), so the deterministic tiebreak — book, then
// chapter, then verse — is what keeps a page boundary stable. The mock
// applies the route's LIMIT/OFFSET itself, exactly as PostgreSQL would.
const BOOKS = ["Genesis", "Exodus", "Psalms", "John"];
const ALL_VERSES = Array.from({ length: 250 }, (_, index) => {
    const book = BOOKS[Math.floor(index / 70) % BOOKS.length];
    const chapter = Math.floor(index / 10) % 50 + 1;
    return {
        text: `Synthetic verse ${index + 1} about the Lord`,
        verse_number: (index % 10) + 1,
        chapter_number: chapter,
        book,
        translation: "BSB",
    };
});
const verseKey = (verse) => `${verse.book}-${verse.chapter_number}:${verse.verse_number}`;

let lastBibleSql = null;
let lastBibleParams = null;

// searchRoutes calls pool.query with a callback, so the mock must
// invoke it (asynchronously, like pg) instead of only returning a
// promise — otherwise the request never completes.
const queryMock = test.mock.method(pool, "query", (sql, params, callback) => {
    const finish = () => {
        if (typeof sql === "string" && sql.includes("FROM bible_verses")) {
            lastBibleSql = sql;
            lastBibleParams = params;
            const limit = params[2];
            const offset = params[3];
            // COUNT(*) OVER() arrives as a bigint string from pg.
            return { rows: ALL_VERSES.slice(offset, offset + limit)
                .map((verse) => ({ ...verse, total: "250" })) };
        }
        if (typeof sql === "string" && sql.includes("FROM commentary_entries")) {
            return { rows: [{ id: 1, excerpt: "synthetic commentary" }] };
        }
        throw new Error(`Unexpected query in search-pagination test: ${sql}`);
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

async function searchBible(query) {
    const response = await fetch(`${baseUrl}/api/search/bible${query}`, {
        headers: { Connection: "close" },
    });
    assert.equal(response.status, 200);
    return response.json();
}

test("Bible search pages through every match with no skips and no duplicates", async () => {
    const pages = [];
    for (const suffix of ["?q=lord", "?q=lord&page=2", "?q=lord&page=3", "?q=lord&page=4"]) {
        pages.push(await searchBible(suffix));
    }
    assert.deepEqual(pages.map((page) => page.results.length), [100, 100, 50, 0]);
    // The total rides on the rows via COUNT(*) OVER(), so a page past
    // the end — which the UI never requests, because page 3 already
    // reports hasMore: false — has no rows to carry it and reports 0.
    assert.deepEqual(pages.map((page) => page.total), [250, 250, 250, 0]);
    assert.deepEqual(pages.map((page) => page.page), [1, 2, 3, 4]);
    assert.deepEqual(pages.map((page) => page.limit), [100, 100, 100, 100]);
    assert.deepEqual(pages.map((page) => page.hasMore), [true, true, false, false]);
    // The window total never leaks into the verse objects.
    assert.ok(pages.every((page) => page.results.every((verse) => !("total" in verse))));

    // Regression: the union of the pages is exactly the full ordered set,
    // with no verse repeated and none missing.
    const seen = pages.flatMap((page) => page.results.map(verseKey));
    assert.equal(new Set(seen).size, 250);
    assert.deepEqual(seen, ALL_VERSES.map(verseKey));
});

test("Bible search rejects invalid pagination and oversized queries before SQL", async () => {
    for (const suffix of ['?q=lord&limit=250', '?q=lord&page=0', '?q=lord&page=-3',
        '?q=lord&page=abc', '?q=lord&page=2junk', '?q=lord&page=99999999999999999999',
        '?q=lord&page=102', '?q=lord&q=other', '?q=' + 'x'.repeat(257), '?q=lord&translation[]=BSB']) {
        lastBibleParams = null;
        const response = await fetch(baseUrl + '/api/search/bible' + suffix);
        assert.equal(response.status, 400, suffix);
        assert.equal(lastBibleParams, null);
    }
    assert.equal((await searchBible('?q=lord&limit=5')).limit, 5);
});

test("Bible search orders by rank with a deterministic tiebreak", async () => {
    await searchBible("?q=lord&page=2&limit=10");
    assert.deepEqual(lastBibleParams, ["lord", "BSB", 10, 10]);
    assert.match(lastBibleSql, /ORDER BY ts_rank\(/);
    // Rank ties are common, so the tiebreak is what makes page
    // boundaries stable — without it a verse could land on two pages
    // or on none.
    assert.match(lastBibleSql, /b\.book_order, c\.chapter_number, v\.verse_number/);
    assert.match(lastBibleSql, /LIMIT \$3 OFFSET \$4/);
});

test("commentary search is unchanged: still a bare capped array", async () => {
    const response = await fetch(`${baseUrl}/api/search/commentary?q=lord`, {
        headers: { Connection: "close" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 1);
});
