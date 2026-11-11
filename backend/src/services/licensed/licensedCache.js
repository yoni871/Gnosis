// Licensed-translation cache and quota counters (PostgreSQL).
//
// All queries take the pool as the first argument so unit tests can inject
// a fake. Nothing here calls a publisher: this module only reads and
// writes the three tables the migration created.
//
// Cache rules, from the publishers' terms:
// - A cached chapter is fresh for 30 days (the longest API.Bible allows;
//   ESV and NLT use the same window). Older rows are refetched.
// - ESV additionally never stores more than 500 verses in total.
//   putCachedChapter evicts the oldest ESV chapters until the total fits.

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ESV_VERSE_CAP = 500;

async function getCachedChapter(pool, translationId, bookId, chapterNumber) {
    const result = await pool.query(
        `SELECT verses, verse_count, fums_token, fetched_at
         FROM licensed_chapter_cache
         WHERE translation_id = $1 AND book_id = $2 AND chapter_number = $3`,
        [translationId, bookId, chapterNumber]
    );
    if (result.rows.length === 0) {
        return null;
    }
    const row = result.rows[0];
    const ageMs = Date.now() - new Date(row.fetched_at).getTime();
    return {
        verses: row.verses,
        verseCount: row.verse_count,
        fumsToken: row.fums_token,
        fetchedAt: row.fetched_at,
        fresh: ageMs < CACHE_TTL_MS,
    };
}

// Store (or refresh) one chapter. For ESV, evict the oldest chapters
// until the stored total is back under the 500-verse cap. Returns the
// stored verse count.
async function putCachedChapter(pool, entry) {
    const { translationId, bookId, chapterNumber, verses, fumsToken, isEsv } = entry;
    const verseCount = verses.length;
    await pool.query(
        `INSERT INTO licensed_chapter_cache
            (translation_id, book_id, chapter_number, verses, verse_count, fums_token, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (translation_id, book_id, chapter_number)
         DO UPDATE SET verses = EXCLUDED.verses,
                       verse_count = EXCLUDED.verse_count,
                       fums_token = EXCLUDED.fums_token,
                       fetched_at = NOW()`,
        [translationId, bookId, chapterNumber, JSON.stringify(verses), verseCount, fumsToken || null]
    );
    if (!isEsv) {
        return verseCount;
    }
    // Evict oldest ESV chapters until the stored total fits the cap.
    for (let guard = 0; guard < 50; guard += 1) {
        const total = await pool.query(
            `SELECT COALESCE(SUM(verse_count), 0) AS total
             FROM licensed_chapter_cache WHERE translation_id = $1`,
            [translationId]
        );
        if (Number(total.rows[0].total) <= ESV_VERSE_CAP) {
            break;
        }
        await pool.query(
            `DELETE FROM licensed_chapter_cache WHERE id IN (
                 SELECT id FROM licensed_chapter_cache
                 WHERE translation_id = $1
                 ORDER BY fetched_at ASC LIMIT 1
             )`,
            [translationId]
        );
    }
    return verseCount;
}

// --- Quota guard -------------------------------------------------------
// One counter row per (provider, period). Period is 'YYYY-MM' for monthly
// budgets (API.Bible) and 'YYYY-MM-DD' for daily budgets (ESV, NLT).

async function recordProviderCall(pool, provider, period) {
    const result = await pool.query(
        `INSERT INTO licensed_api_usage (provider, period, calls)
         VALUES ($1, $2, 1)
         ON CONFLICT (provider, period)
         DO UPDATE SET calls = licensed_api_usage.calls + 1
         RETURNING calls`,
        [provider, period]
    );
    return Number(result.rows[0].calls);
}

async function getProviderCalls(pool, provider, period) {
    const result = await pool.query(
        `SELECT calls FROM licensed_api_usage
         WHERE provider = $1 AND period = $2`,
        [provider, period]
    );
    return result.rows.length === 0 ? 0 : Number(result.rows[0].calls);
}

// --- Per-visitor limit -------------------------------------------------
// Counts uncached licensed fetches per hashed visitor per hour. Cached
// chapters are free and unlimited, so only calls that would reach a
// publisher are counted here. Returns { allowed, calls }.

async function checkIpLimit(pool, keyHash, limit) {
    await pool.query(
        `DELETE FROM licensed_ip_limits
         WHERE window_hour < NOW() - INTERVAL '2 hours'`
    );
    const result = await pool.query(
        `INSERT INTO licensed_ip_limits (key_hash, window_hour, calls)
         VALUES ($1, date_trunc('hour', NOW()), 1)
         ON CONFLICT (key_hash, window_hour)
         DO UPDATE SET calls = licensed_ip_limits.calls + 1
         RETURNING calls`,
        [keyHash]
    );
    const calls = Number(result.rows[0].calls);
    return { allowed: calls <= limit, calls };
}

module.exports = {
    CACHE_TTL_MS,
    ESV_VERSE_CAP,
    getCachedChapter,
    putCachedChapter,
    recordProviderCall,
    getProviderCalls,
    checkIpLimit,
};
