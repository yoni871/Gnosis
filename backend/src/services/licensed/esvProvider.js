// ESV provider — Crossway's ESV API (api.esv.org).
//
// Terms (read 2026-11-06, re-check before changing a cap or a notice):
// - Free for non-commercial use; no formal permission needed for a
//   non-commercial site. Commercial use needs a direct Crossway licence.
// - At most 500 verses per query, 5,000 queries a day, 1,000 an hour,
//   60 a minute.
// - Never store more than 500 verses or one-half of any book locally.
//   That cap is enforced by the cache layer (licensedCache), not here.
// - Attribution: the standard ESV notice with the text (stored on the
//   translation row) and a link to esv.org on every page that uses it.
// - Never sell, share, or publish the access key.
//
// The passage/text endpoint returns one text blob per passage. With
// include-verse-numbers=true the verses are marked [1], [2], ... — the
// parser below splits on those markers, so the response shape must be
// re-verified against the live API before trusting a format change.

const ESV_API_URL = "https://api.esv.org/v3/passage/text/";

class LicensedProviderError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "LicensedProviderError";
        this.code = code;
    }
}

// Split an ESV passage blob into {verse_number, text} rows. `passages` is
// the `passages` array from the API response. Verse numbers must arrive
// consecutive from 1; anything else means the format changed, and we fail
// loudly instead of serving mis-split verses.
function parseEsvPassages(passages) {
    const text = (passages || []).join("\n");
    const parts = text.split(/\[(\d+)\]\s*/);
    // parts[0] is whatever precedes the first [1] marker (a heading, if
    // one slipped through) — discarded. Then number, verse, number, verse...
    const verses = [];
    for (let i = 1; i + 1 < parts.length; i += 2) {
        const verseNumber = parseInt(parts[i], 10);
        const verseText = parts[i + 1].replace(/\s+/g, " ").trim();
        if (!verseText) {
            throw new LicensedProviderError(
                "provider-format",
                `ESV response has an empty verse ${verseNumber}.`
            );
        }
        verses.push({ verse_number: verseNumber, text: verseText });
    }
    if (verses.length === 0) {
        throw new LicensedProviderError(
            "provider-format",
            "ESV response contained no verse markers."
        );
    }
    for (let i = 0; i < verses.length; i += 1) {
        if (verses[i].verse_number !== i + 1) {
            throw new LicensedProviderError(
                "provider-format",
                `ESV verses are not consecutive from 1 (got ${verses[i].verse_number} at position ${i + 1}).`
            );
        }
    }
    return verses;
}

// The five single-chapter books. Crossway's ESV API parses a free-text
// reference such as `q=Obadiah 1` as verse 1 of Obadiah, not chapter 1,
// so requesting chapter 1 of these books returns a single verse. Sending
// just the book name (`q=Obadiah`) returns the whole (only) chapter.
// Every other book keeps the existing `q=<Book> <chapter>` format.
const SINGLE_CHAPTER_BOOKS = new Set([
    "Obadiah",
    "Philemon",
    "Jude",
    "2 John",
    "3 John",
]);

async function fetchEsvChapter(book, chapter, options = {}) {
    const apiKey = options.apiKey || process.env.ESV_API_KEY;
    if (!apiKey) {
        throw new LicensedProviderError(
            "key-missing",
            "ESV_API_KEY is not configured."
        );
    }
    const fetchImpl = options.fetchImpl || fetch;
    const query =
        SINGLE_CHAPTER_BOOKS.has(book) && Number(chapter) === 1
            ? book
            : `${book} ${chapter}`;
    const params = new URLSearchParams({
        q: query,
        "include-verse-numbers": "true",
        "include-headings": "false",
        "include-footnotes": "false",
        "include-short-copyright": "false",
        "include-passage-references": "false",
    });
    let response;
    try {
        // Bounded so a hung provider fails into the 503/BSB fallback
        // instead of holding the reader (and the serverless function)
        // open indefinitely. The AbortError is caught below and wrapped
        // like any other provider failure. fetchTimeoutMs is test-only;
        // production always uses the 8 s default.
        const timeoutMs = options.fetchTimeoutMs ?? 8000;
        response = await fetchImpl(`${ESV_API_URL}?${params.toString()}`, {
            headers: { Authorization: `Token ${apiKey}` },
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (error) {
        throw new LicensedProviderError(
            "provider",
            `ESV request failed: ${error.message}`
        );
    }
    if (!response.ok) {
        throw new LicensedProviderError(
            "provider",
            `ESV request failed with HTTP ${response.status}.`
        );
    }
    let body;
    try {
        body = await response.json();
    } catch (error) {
        throw new LicensedProviderError(
            "provider-format",
            "ESV response was not JSON."
        );
    }
    return { verses: parseEsvPassages(body.passages), fumsToken: null };
}

module.exports = { fetchEsvChapter, parseEsvPassages, LicensedProviderError };
