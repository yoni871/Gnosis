const test = require("node:test");
const assert = require("node:assert/strict");

// Explicit isolation also protects direct node --test invocations.
process.env.GNOSIS_TEST_ISOLATION = "1";
process.env.RATE_LIMIT_KEY_SECRET = "test-rate-limit-secret-synthetic-test-secret";
process.env.ESV_API_KEY = "test-esv-key";
process.env.API_BIBLE_KEY = "test-api-bible-key";
process.env.API_BIBLE_NIV_ID = "test-niv-id";
process.env.API_BIBLE_NKJV_ID = "test-nkjv-id";
process.env.NLT_API_KEY = "test-nlt-key";

const {
    getLicensedChapter,
    isProviderConfigured,
    clearInFlightForTests,
} = require("../../src/services/licensed/licensedTranslations");

const BOOK_IDS = { Genesis: 2, John: 44, Psalms: 20 };

// ---------------------------------------------------------------------------
// Fake PostgreSQL pool: keeps the cache, usage, and IP-limit tables in
// memory and answers the licensed service's SQL by pattern, so the
// orchestration (cache, quota, IP limit, coalescing) can be proven
// without a database.
// ---------------------------------------------------------------------------

class FakePool {
    constructor() {
        this.cache = new Map(); // "translationId:bookId:chapter" -> row
        this.usage = new Map(); // "provider:period" -> calls
        this.ipLimits = new Map(); // "hash:hour" -> calls
        this.fetchCount = 0;
    }

    key(translationId, bookId, chapter) {
        return `${translationId}:${bookId}:${chapter}`;
    }

    async query(sql, params = []) {
        if (sql.includes("FROM bible_books")) {
            const name = params[0];
            return { rows: BOOK_IDS[name] ? [{ id: BOOK_IDS[name] }] : [] };
        }
        // The SUM check must come before the generic cache SELECT: the
        // SUM query also selects from licensed_chapter_cache.
        if (sql.includes("COALESCE(SUM(verse_count)")) {
            let total = 0;
            for (const [key, row] of this.cache) {
                if (key.startsWith(`${params[0]}:`)) {
                    total += row.verse_count;
                }
            }
            return { rows: [{ total }] };
        }
        // The DELETE check must come before the generic cache SELECT: the
        // eviction DELETE contains a SELECT subquery on the same table.
        if (sql.includes("DELETE FROM licensed_chapter_cache")) {
            // Evict the oldest row for the translation (insertion order).
            for (const [key, row] of this.cache) {
                if (key.startsWith(`${params[0]}:`)) {
                    this.cache.delete(key);
                    break;
                }
            }
            return { rows: [] };
        }
        if (sql.includes("FROM licensed_chapter_cache") && sql.includes("SELECT")) {
            const row = this.cache.get(this.key(params[0], params[1], params[2]));
            return { rows: row ? [row] : [] };
        }
        if (sql.includes("INSERT INTO licensed_chapter_cache")) {
            const [translationId, bookId, chapterNumber, versesJson, verseCount, fumsToken] = params;
            this.cache.set(this.key(translationId, bookId, chapterNumber), {
                verses: JSON.parse(versesJson),
                verse_count: verseCount,
                fums_token: fumsToken,
                fetched_at: new Date().toISOString(),
            });
            return { rows: [] };
        }
        if (sql.includes("INSERT INTO licensed_api_usage")) {
            const key = `${params[0]}:${params[1]}`;
            const calls = (this.usage.get(key) || 0) + 1;
            this.usage.set(key, calls);
            return { rows: [{ calls }] };
        }
        if (sql.includes("FROM licensed_api_usage")) {
            const calls = this.usage.get(`${params[0]}:${params[1]}`) || 0;
            return { rows: calls === 0 ? [] : [{ calls }] };
        }
        if (sql.includes("DELETE FROM licensed_ip_limits")) {
            return { rows: [] };
        }
        if (sql.includes("INSERT INTO licensed_ip_limits")) {
            const key = `${params[0]}:hour`;
            const calls = (this.ipLimits.get(key) || 0) + 1;
            this.ipLimits.set(key, calls);
            return { rows: [{ calls }] };
        }
        throw new Error(`FakePool: unexpected SQL: ${sql.slice(0, 80)}`);
    }
}

const ESV_ROW = { id: 5, name: "English Standard Version", abbreviation: "ESV", source: "esv", enabled: true };
const NIV_ROW = { id: 6, name: "New International Version", abbreviation: "NIV", source: "api-bible", enabled: true };
const BSB_ROW = { id: 1, name: "Berean Standard Bible", abbreviation: "BSB", source: "database", enabled: true };

function fakeFetchFactory(text) {
    const calls = { count: 0, urls: [] };
    const fetchImpl = async (url) => {
        calls.count += 1;
        calls.urls.push(url);
        return {
            ok: true,
            status: 200,
            json: async () => ({ passages: [text] }),
            text: async () => text,
        };
    };
    return { fetchImpl, calls };
}

test.afterEach(() => {
    clearInFlightForTests();
});

test("isProviderConfigured hides licensed translations until their keys exist", () => {
    assert.equal(isProviderConfigured(BSB_ROW), true);
    assert.equal(isProviderConfigured(ESV_ROW), true);
    const saved = process.env.ESV_API_KEY;
    delete process.env.ESV_API_KEY;
    // isProviderConfigured reads env at call time, so removing the key hides ESV.
    assert.equal(isProviderConfigured(ESV_ROW), false);
    process.env.ESV_API_KEY = saved;
});

test("first read fetches live, second read serves the cache without another provider call", async () => {
    const pool = new FakePool();
    const { fetchImpl, calls } = fakeFetchFactory("[1] In the beginning. [2] And the earth was.");
    const options = { pool, fetchImpl, rateLimitSecret: "test-rate-limit-secret" };
    const first = await getLicensedChapter(ESV_ROW, "Genesis", 1, "203.0.113.7", options);
    assert.equal(first.cached, false);
    assert.equal(first.verses.length, 2);
    const second = await getLicensedChapter(ESV_ROW, "Genesis", 1, "203.0.113.7", options);
    assert.equal(second.cached, true);
    assert.deepEqual(second.verses, first.verses);
    assert.equal(calls.count, 1);
});

test("a stale cached chapter (older than 30 days) is refetched", async () => {
    const pool = new FakePool();
    const { fetchImpl, calls } = fakeFetchFactory("[1] In the beginning.");
    const options = { pool, fetchImpl, rateLimitSecret: "test-rate-limit-secret" };
    await getLicensedChapter(ESV_ROW, "Genesis", 1, "203.0.113.7", options);
    const row = pool.cache.get("5:2:1");
    row.fetched_at = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const reread = await getLicensedChapter(ESV_ROW, "Genesis", 1, "203.0.113.7", options);
    assert.equal(reread.cached, false);
    assert.equal(calls.count, 2);
});

test("simultaneous requests for the same uncached chapter share one provider call", async () => {
    const pool = new FakePool();
    const { fetchImpl, calls } = fakeFetchFactory("[1] In the beginning.");
    const options = { pool, fetchImpl, rateLimitSecret: "test-rate-limit-secret" };
    const [a, b] = await Promise.all([
        getLicensedChapter(ESV_ROW, "John", 3, "203.0.113.7", options),
        getLicensedChapter(ESV_ROW, "John", 3, "203.0.113.8", options),
    ]);
    assert.deepEqual(a.verses, b.verses);
    assert.equal(calls.count, 1);
});

test("quota guard refuses a provider call once the budget is spent", async () => {
    const pool = new FakePool();
    pool.usage.set(`esv:${new Date().toISOString().slice(0, 10)}`, 4500);
    const { fetchImpl, calls } = fakeFetchFactory("[1] In the beginning.");
    const options = { pool, fetchImpl, rateLimitSecret: "test-rate-limit-secret" };
    await assert.rejects(
        getLicensedChapter(ESV_ROW, "Genesis", 1, "203.0.113.7", options),
        /budget reached/
    );
    assert.equal(calls.count, 0);
});

test("per-visitor limit refuses the 31st uncached fetch in an hour", async () => {
    const pool = new FakePool();
    const { fetchImpl, calls } = fakeFetchFactory("[1] Verse one.");
    const options = { pool, fetchImpl, rateLimitSecret: "test-rate-limit-secret" };
    // 30 distinct uncached chapters for one visitor: use Psalms 1..30.
    for (let chapter = 1; chapter <= 30; chapter += 1) {
        await getLicensedChapter(ESV_ROW, "Psalms", chapter, "203.0.113.7", options);
    }
    assert.equal(calls.count, 30);
    await assert.rejects(
        getLicensedChapter(ESV_ROW, "Psalms", 31, "203.0.113.7", options),
        /Too many uncached/
    );
    assert.equal(calls.count, 30);
});

test("cached chapters do not count against the per-visitor limit", async () => {
    const pool = new FakePool();
    const { fetchImpl } = fakeFetchFactory("[1] In the beginning.");
    const options = { pool, fetchImpl, rateLimitSecret: "test-rate-limit-secret" };
    await getLicensedChapter(ESV_ROW, "Genesis", 1, "203.0.113.7", options);
    // 40 more reads of the same cached chapter: all free, none counted.
    for (let i = 0; i < 40; i += 1) {
        const read = await getLicensedChapter(ESV_ROW, "Genesis", 1, "203.0.113.7", options);
        assert.equal(read.cached, true);
    }
    assert.equal(pool.ipLimits.size, 1);
    assert.equal([...pool.ipLimits.values()][0], 1);
});

test("ESV cache evicts the oldest chapters once 500 verses are stored", async () => {
    const pool = new FakePool();
    const cache = require("../../src/services/licensed/licensedCache");
    // Three 200-verse chapters: storing the third must evict the first.
    const big = Array.from({ length: 200 }, (_v, i) => ({ verse_number: i + 1, text: "x" }));
    await cache.putCachedChapter(pool, { translationId: 5, bookId: 20, chapterNumber: 1, verses: big, fumsToken: null, isEsv: true });
    await cache.putCachedChapter(pool, { translationId: 5, bookId: 20, chapterNumber: 2, verses: big, fumsToken: null, isEsv: true });
    await cache.putCachedChapter(pool, { translationId: 5, bookId: 20, chapterNumber: 3, verses: big, fumsToken: null, isEsv: true });
    assert.equal(pool.cache.has("5:20:1"), false);
    assert.equal(pool.cache.has("5:20:2"), true);
    assert.equal(pool.cache.has("5:20:3"), true);
    let total = 0;
    for (const row of pool.cache.values()) {
        total += row.verse_count;
    }
    assert.ok(total <= 500);
});
