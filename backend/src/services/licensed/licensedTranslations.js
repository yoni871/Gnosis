const { logFailure } = require("../../utils/safeLog");
// Licensed-translation orchestrator.
//
// One chapter at a time, only for the translation the reader actually
// opened, and only when the server cache misses:
//
//   cache (30 days, ESV additionally capped at 500 verses total)
//     -> quota guard (provider budget for the current period)
//     -> per-visitor limit (uncached fetches only; cached chapters are
//        free and unlimited)
//     -> provider fetch (ESV / API.Bible / NLT, each in its own file)
//     -> record the call, store the chapter, report FUMS (API.Bible)
//
// Simultaneous requests for the same uncached chapter share one provider
// call (in-flight coalescing), so a burst of readers costs one call.
//
// Removal: flip the translation row's `enabled` to false (one UPDATE) and
// the chapter endpoint stops serving it and /translations stops listing
// it. Delete the row and its cache rows to remove it entirely. No code
// change, no redeploy. Going commercial instead means swapping the free
// keys for paid licences — the providers, cache and kill-switch stay.
//
// Failures never leak provider detail to the reader: every provider-side
// failure becomes a LicensedProviderError, which the controller turns
// into a generic 503 the frontend answers by falling back to BSB.

const crypto = require("node:crypto");
const pool = require("../../db/db");
const { biblePool } = require("../../db/db");
const cache = require("./licensedCache");
const { fetchEsvChapter, LicensedProviderError } = require("./esvProvider");
const { fetchApiBibleChapter } = require("./apiBibleProvider");
const { fetchNltChapter } = require("./nltProvider");

const CACHE_TTL_MS = cache.CACHE_TTL_MS;

// Monthly budget for API.Bible (Starter: 5,000 calls a month) and daily
// budgets for ESV and NLT (each 5,000 a day). The guard stops 500 short
// so a burst cannot spend the last calls the licences need for errors
// and retries.
const PROVIDER_BUDGETS = {
    "api-bible": { period: "month", limit: 4500 },
    esv: { period: "day", limit: 4500 },
    nlt: { period: "day", limit: 4500 },
};

// Uncached licensed chapters one visitor may trigger per hour. Cached
// chapters do not count.
const IP_LIMIT_PER_HOUR = 30;

// API.Bible Bible IDs. NASB 2020's is published in API.Bible's catalogue;
// NIV and NKJV come from the API.Bible dashboard when the Bibles are
// picked (each Bible's page shows its ID) — see
// docs/LicensedTranslations.md. No ID is guessed here.
const API_BIBLE_IDS = {
    NIV: process.env.API_BIBLE_NIV_ID || null,
    NKJV: process.env.API_BIBLE_NKJV_ID || null,
    NASB: process.env.API_BIBLE_NASB_ID || "a761ca71e0b3ddcf-01",
};

const FUMS_REPORT_URL = "https://fums.api.bible/f3";

// One anonymous device id per backend process (FUMS asks for a stable id
// per device; serverless has no stable device, so per-process is the
// closest equivalent). Session ids are random per report. Neither value
// carries personal data.
const DEVICE_ID = crypto.randomUUID();

const inFlight = new Map();

function monthPeriod(date = new Date()) {
    return date.toISOString().slice(0, 7);
}

function dayPeriod(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function periodFor(provider, date = new Date()) {
    const budget = PROVIDER_BUDGETS[provider];
    return budget.period === "month" ? monthPeriod(date) : dayPeriod(date);
}

// Whether a licensed translation can be served right now: the row is
// enabled and its provider key (and Bible ID, for API.Bible) is set.
// /translations uses this to hide unconfigured translations, so the site
// behaves exactly as before until the keys arrive.
function isProviderConfigured(translation) {
    if (!translation || translation.source === "database") {
        return true;
    }
    if (translation.source === "esv") {
        return Boolean(process.env.ESV_API_KEY);
    }
    if (translation.source === "nlt") {
        return Boolean(process.env.NLT_API_KEY);
    }
    if (translation.source === "api-bible") {
        return Boolean(process.env.API_BIBLE_KEY && API_BIBLE_IDS[translation.abbreviation]);
    }
    return false;
}

function rateLimitSecret(options) {
    const secret = options.rateLimitSecret || process.env.RATE_LIMIT_KEY_SECRET;
    if (!secret) {
        throw new LicensedProviderError(
            "key-missing",
            "RATE_LIMIT_KEY_SECRET is not configured."
        );
    }
    return secret;
}

function hashIp(ip, secret) {
    return crypto
        .createHmac("sha256", secret)
        .update(`licensed-fetch:${ip}`)
        .digest("hex");
}

async function getBookId(dbPool, book) {
    const result = await dbPool.query(
        "SELECT id FROM bible_books WHERE name = $1",
        [book]
    );
    if (result.rows.length === 0) {
        throw new LicensedProviderError(
            "provider-format",
            `Unknown book "${book}".`
        );
    }
    return result.rows[0].id;
}

// Best-effort FUMS display report. Never blocks the response and never
// throws: a failed report must not break the reader.
async function reportFums(fumsToken, options = {}) {
    if (!fumsToken) {
        return;
    }
    const fetchImpl = options.fetchImpl || fetch;
    const url =
        `${FUMS_REPORT_URL}?t=${encodeURIComponent(fumsToken)}` +
        `&dId=${encodeURIComponent(DEVICE_ID)}` +
        `&sId=${encodeURIComponent(crypto.randomUUID())}`;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2000);
        try {
            await fetchImpl(url, { signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    } catch (error) {
        // FUMS reporting is fire-and-forget; log at most.
        logFailure("fumsReport", error);
    }
}

function fetchChapterFromProvider(translation, book, chapter, options) {
    if (translation.source === "esv") {
        return fetchEsvChapter(book, chapter, options);
    }
    if (translation.source === "nlt") {
        return fetchNltChapter(book, chapter, options);
    }
    if (translation.source === "api-bible") {
        return fetchApiBibleChapter(
            book,
            chapter,
            API_BIBLE_IDS[translation.abbreviation],
            options
        );
    }
    throw new LicensedProviderError(
        "provider-format",
        `Unknown licensed source "${translation.source}".`
    );
}

async function fetchAndStore(dbPool, translation, book, bookId, chapter, clientIp, options) {
    const budget = PROVIDER_BUDGETS[translation.source];
    const period = periodFor(translation.source);
    const used = await cache.getProviderCalls(dbPool, translation.source, period);
    if (used >= budget.limit) {
        throw new LicensedProviderError(
            "quota",
            `${translation.source} monthly/daily budget reached.`
        );
    }
    const secret = rateLimitSecret(options);
    const ipCheck = await cache.checkIpLimit(
        dbPool,
        hashIp(clientIp, secret),
        IP_LIMIT_PER_HOUR
    );
    if (!ipCheck.allowed) {
        throw new LicensedProviderError(
            "ip-limit",
            "Too many uncached licensed chapters from this visitor."
        );
    }
    const fetched = await fetchChapterFromProvider(translation, book, chapter, options);
    await cache.recordProviderCall(dbPool, translation.source, period);
    await cache.putCachedChapter(dbPool, {
        translationId: translation.id,
        bookId,
        chapterNumber: chapter,
        verses: fetched.verses,
        fumsToken: fetched.fumsToken,
        isEsv: translation.source === "esv",
    });
    await reportFums(fetched.fumsToken, options);
    return fetched.verses;
}

// Fetch one licensed chapter. Returns { verses, cached }. `translation`
// is the bible_translations row; `clientIp` is the request IP (req.ip).
// Throws LicensedProviderError on any provider-side failure.
async function getLicensedChapter(translation, book, chapter, clientIp, options = {}) {
    // Cache, quota and IP-limit writes live in the App project; the book
    // lookup reads bible_books in the Bible project. Tests inject one
    // fake pool for everything via options.pool, so it doubles as the
    // lookup pool there; production uses the Bible pool.
    const dbPool = options.pool || pool;
    const lookupPool = options.biblePool || (options.pool ? options.pool : biblePool);
    const bookId = await getBookId(lookupPool, book);
    const cached = await cache.getCachedChapter(dbPool, translation.id, bookId, chapter);
    if (cached && cached.fresh) {
        await reportFums(cached.fumsToken, options);
        return { verses: cached.verses, cached: true };
    }
    const key = `${translation.id}:${bookId}:${chapter}`;
    if (inFlight.has(key)) {
        const verses = await inFlight.get(key);
        return { verses, cached: false };
    }
    const task = fetchAndStore(dbPool, translation, book, bookId, chapter, clientIp, options);
    inFlight.set(key, task);
    try {
        const verses = await task;
        return { verses, cached: false };
    } finally {
        inFlight.delete(key);
    }
}

function clearInFlightForTests() {
    inFlight.clear();
}

module.exports = {
    CACHE_TTL_MS,
    PROVIDER_BUDGETS,
    IP_LIMIT_PER_HOUR,
    API_BIBLE_IDS,
    isProviderConfigured,
    getLicensedChapter,
    reportFums,
    clearInFlightForTests,
};
