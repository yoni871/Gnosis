// API.Bible provider — American Bible Society (scripture.api.bible).
//
// Covers NIV, NKJV and NASB 2020 on the free Starter plan: pick 3 licensed
// Bibles, 5,000 API calls a month, strictly non-commercial. Commercial use
// needs a Pro plan plus a per-translation licence (and NIV is not
// available commercially through API.Bible at all — that needs Biblica
// directly).
//
// Terms (read 2026-11-06, re-check before changing a cap or a notice):
// - Cached content must be refreshed at least once every 30 days. The
//   cache layer uses exactly 30 days.
// - FUMS v3 (Fair Use Management System) is required: content requests
//   carry fums-version=3, and each display is reported with the
//   fumsToken from the response (see reportFums in licensedTranslations).
// - Starter-plan apps must show a visible citation and hyperlink to
//   https://api.bible in the interface (the notice_url on the NIV/NKJV
//   rows; NASB links to lockman.org per Lockman's own terms instead).
// - No more than 500 consecutive verses per request, and never a complete
//   book. One chapter is always within that (longest chapter: Psalm 119,
//   176 verses).
//
// The chapter endpoint returns the whole chapter as one HTML blob in
// data.content: verse text follows a
// <span data-number="N" data-sid="..." class="v">N</span> marker, several
// verses may share one paragraph, and section headings ride along as
// <p class="s*">. The parser below splits on those markers, so the
// response shape must be re-verified against the live API before trusting
// a format change.
//
// Do NOT use the chapter-verses list endpoint
// (/bibles/{id}/chapters/{id}/verses): it returns verse metadata only
// and no content, so every verse parses empty (issue #35).

const API_BIBLE_BASE = "https://api.scripture.api.bible/v1";

// Gnosis book name -> USFM 3-letter code, the code API.Bible uses in its
// chapter ids (GEN.1, JHN.3, PSA.119, ...).
const BOOK_CODES = {
    Genesis: "GEN",
    Exodus: "EXO",
    Leviticus: "LEV",
    Numbers: "NUM",
    Deuteronomy: "DEU",
    Joshua: "JOS",
    Judges: "JDG",
    Ruth: "RUT",
    "1 Samuel": "1SA",
    "2 Samuel": "2SA",
    "1 Kings": "1KI",
    "2 Kings": "2KI",
    "1 Chronicles": "1CH",
    "2 Chronicles": "2CH",
    Ezra: "EZR",
    Nehemiah: "NEH",
    Esther: "EST",
    Job: "JOB",
    Psalms: "PSA",
    Proverbs: "PRO",
    Ecclesiastes: "ECC",
    "Song of Solomon": "SNG",
    Isaiah: "ISA",
    Jeremiah: "JER",
    Lamentations: "LAM",
    Ezekiel: "EZK",
    Daniel: "DAN",
    Hosea: "HOS",
    Joel: "JOL",
    Amos: "AMO",
    Obadiah: "OBA",
    Jonah: "JON",
    Micah: "MIC",
    Nahum: "NAM",
    Habakkuk: "HAB",
    Zephaniah: "ZEP",
    Haggai: "HAG",
    Zechariah: "ZEC",
    Malachi: "MAL",
    Matthew: "MAT",
    Mark: "MRK",
    Luke: "LUK",
    John: "JHN",
    Acts: "ACT",
    Romans: "ROM",
    "1 Corinthians": "1CO",
    "2 Corinthians": "2CO",
    Galatians: "GAL",
    Ephesians: "EPH",
    Philippians: "PHP",
    Colossians: "COL",
    "1 Thessalonians": "1TH",
    "2 Thessalonians": "2TH",
    "1 Timothy": "1TI",
    "2 Timothy": "2TI",
    Titus: "TIT",
    Philemon: "PHM",
    Hebrews: "HEB",
    James: "JAS",
    "1 Peter": "1PE",
    "2 Peter": "2PE",
    "1 John": "1JN",
    "2 John": "2JN",
    "3 John": "3JN",
    Jude: "JUD",
    Revelation: "REV",
};

const { LicensedProviderError } = require("./esvProvider");

function decodeEntities(text) {
    return text
        .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, " ");
}

// Strip one verse's HTML fragment to plain text. The number span is
// removed by its markup (not by stripping a leading number, which could
// eat a real leading digit in the verse text). Section headings that ride
// along in a verse's content are dropped.
//
// Spacing: block-level boundaries become a space (poetry lines spanning
// paragraphs stay separate words), but inline tags are removed with NO
// space — API.Bible wraps part of a word in a small-caps span
// (L<span>ord</span>), and a footnote marker can sit between a word and
// its punctuation (Lord <span></span>,). Replacing every tag with a space
// split those words ("L ord") and left a gap before the punctuation
// ("Lord ,"). A stripped tag must also never leave a space before
// punctuation, so any remaining one is dropped.
//
// One exception: invisible markup that carries no verse text sits BETWEEN
// words, so it becomes a space — stripping it outright joined the words
// on either side. That covers an element with no text in it (a
// cross-reference or footnote marker, which carries no text when notes
// are excluded: "Or<span></span>who" -> "Orwho"), an HTML comment
// ("Or<!-- ... -->who"), a tag that opens but never closes in this
// fragment, and a closing tag whose opener sits before this verse's
// first word ("Or</span>who" — a span that opened in an earlier verse
// and closes here). A tag that does close later just wraps text and is
// dropped.
// Last resort: a verse can start with two words joined and no markup
// between them at all — API.Bible drops the cross-reference marker
// entirely when notes are excluded, leaving e.g. "Orwho" (NKJV Romans
// 11:35) and "Andit" (NKJV Acts 2:17). There is nothing to strip, so the
// parser repairs the join at the text level, and only there: the first
// word of the verse, split into a common verse-start word (or, and, but
// ...) plus a common word (who, it, are ...). A proper name at a verse
// start (Bethany) does not split — its first part is not a verse-start
// word — and a genuine compound mid-verse (firstfruit) is never touched.
const VERSE_START_WORDS = ["or", "and", "but", "for", "the", "then", "now", "when", "so", "yet", "as", "if", "o"];
const COMMON_WORDS = new Set([
    "who", "it", "are", "is", "they", "he", "she", "we", "you", "this", "that", "there", "here",
    "what", "when", "where", "all", "the", "a", "an", "my", "his", "her", "their", "our", "your",
    "no", "not", "so", "then", "now", "will", "shall", "can", "could", "would", "should", "may",
    "might", "must", "have", "has", "had", "do", "does", "did", "be", "been", "am", "was", "were",
    "lord", "god", "jesus", "christ", "king", "man", "son", "day", "time", "way", "word", "house",
    "land", "people", "children", "hand", "earth", "heaven", "faith", "life", "death", "sin", "law",
    "grace", "truth", "light", "world", "kingdom", "spirit", "soul", "heart", "voice", "name", "work",
    "power", "glory", "praise", "blessed", "holy", "good", "great", "first", "last", "new", "old",
    "one", "two", "three", "many", "much", "more", "most", "other", "into", "over", "under", "again",
    "once", "out", "up", "down", "off", "on", "in", "at", "to", "for", "of", "with", "by", "from",
    "about", "through", "after", "before", "between", "and", "or", "but", "as", "if", "then", "yet",
]);
function repairVerseStartJoin(text) {
    return text.replace(/^([“‘"'([]*)([A-Za-z]+)/, (match, lead, word) => {
        const low = word.toLowerCase();
        for (const first of VERSE_START_WORDS) {
            if (low.startsWith(first) && low.length > first.length && COMMON_WORDS.has(low.slice(first.length))) {
                return lead + word.slice(0, first.length) + " " + word.slice(first.length);
            }
        }
        return match;
    });
}
function stripVerseHtml(html) {
    let text = html || "";
    text = text.replace(/<!--[\s\S]*?-->/g, " ");
    text = text.replace(/<p[^>]*class="s\d?"[^>]*>[\s\S]*?<\/p>/g, " ");
    text = text.replace(/<span[^>]*class="v"[^>]*>\d+<\/span>/g, " ");
    text = text.replace(/<\/?(p|div|br|h[1-6]|li|ul|ol|table|tr|td|th)[^>]*>/gi, " ");
    text = text.replace(/<([a-z][a-z0-9]*)[^>]*>(?:\s|<[^>]+>)*<\/\1>/gi, " ");
    text = text.replace(/<[^>]+\/>/g, " ");
    text = text.replace(/<([a-z][a-z0-9]*)[^>]*>/gi, (match, tag, offset, str) =>
        new RegExp(`</${tag}\\s*>`, "i").test(str.slice(offset + match.length)) ? "" : " "
    );
    text = text.replace(/([\p{L}\p{N}])(<\/[a-z][a-z0-9]*\s*>)(?=[\p{L}\p{N}])/giu, "$1 ");
    text = text.replace(/<[^>]+>/g, "");
    return repairVerseStartJoin(decodeEntities(text)
        .replace(/\s+/g, " ")
        .replace(/\s+([.,;:!?])/g, "$1")
        .trim());
}

// Split one chapter's HTML into {verse_number, text} rows. Numbers must
// be consecutive from 1, like the ESV parser: a format change fails
// loudly instead of serving mis-split verses.
function parseApiBibleChapter(html) {
    if (typeof html !== "string" || html.length === 0) {
        throw new LicensedProviderError(
            "provider-format",
            "API.Bible chapter response contained no content."
        );
    }
    const parts = html.split(/<span[^>]*class="v"[^>]*>(\d+)<\/span>/);
    // parts[0] is whatever precedes the first verse marker (section
    // headings, if any) — discarded. Then number, segment, number, segment...
    const verses = [];
    for (let i = 1; i + 1 < parts.length; i += 2) {
        const verseNumber = parseInt(parts[i], 10);
        const verseText = stripVerseHtml(parts[i + 1]);
        if (!verseText) {
            throw new LicensedProviderError(
                "provider-format",
                `API.Bible response has an empty verse ${verseNumber}.`
            );
        }
        verses.push({ verse_number: verseNumber, text: verseText });
    }
    if (verses.length === 0) {
        throw new LicensedProviderError(
            "provider-format",
            "API.Bible chapter response contained no verse markers."
        );
    }
    for (let i = 0; i < verses.length; i += 1) {
        if (verses[i].verse_number !== i + 1 || !verses[i].text) {
            throw new LicensedProviderError(
                "provider-format",
                `API.Bible verses are not consecutive from 1 with text (position ${i + 1}).`
            );
        }
    }
    return verses;
}

async function fetchApiBibleChapter(book, chapter, bibleId, options = {}) {
    const apiKey = options.apiKey || process.env.API_BIBLE_KEY;
    if (!apiKey) {
        throw new LicensedProviderError(
            "key-missing",
            "API_BIBLE_KEY is not configured."
        );
    }
    if (!bibleId) {
        throw new LicensedProviderError(
            "key-missing",
            "No API.Bible Bible ID is configured for this translation."
        );
    }
    const code = BOOK_CODES[book];
    if (!code) {
        throw new LicensedProviderError(
            "provider-format",
            `No API.Bible book code for "${book}".`
        );
    }
    const fetchImpl = options.fetchImpl || fetch;
    // The chapter endpoint returns the whole chapter as HTML in
    // data.content. The chapter-verses list endpoint must NOT be used: it
    // returns no verse content (issue #35). Params are pinned so a changed
    // API.Bible default cannot silently change the shape.
    const params = new URLSearchParams({
        "content-type": "html",
        "include-verse-numbers": "true",
        "include-chapter-numbers": "false",
        "include-notes": "false",
        "fums-version": "3",
    });
    const url =
        `${API_BIBLE_BASE}/bibles/${bibleId}` +
        `/chapters/${code}.${chapter}?${params.toString()}`;
    let response;
    try {
        // Bounded so a hung provider fails into the 503/BSB fallback
        // instead of holding the reader (and the serverless function)
        // open indefinitely. The AbortError is caught below and wrapped
        // like any other provider failure. fetchTimeoutMs is test-only;
        // production always uses the 8 s default.
        const timeoutMs = options.fetchTimeoutMs ?? 8000;
        response = await fetchImpl(url, {
            headers: { "api-key": apiKey },
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (error) {
        throw new LicensedProviderError(
            "provider",
            `API.Bible request failed: ${error.message}`
        );
    }
    if (!response.ok) {
        throw new LicensedProviderError(
            "provider",
            `API.Bible request failed with HTTP ${response.status}.`
        );
    }
    let body;
    try {
        body = await response.json();
    } catch (error) {
        throw new LicensedProviderError(
            "provider-format",
            "API.Bible response was not JSON."
        );
    }
    const content = body && body.data && body.data.content;
    if (typeof content !== "string" || content.length === 0) {
        throw new LicensedProviderError(
            "provider-format",
            "API.Bible chapter response contained no content."
        );
    }
    return {
        verses: parseApiBibleChapter(content),
        fumsToken: (body.meta && body.meta.fumsToken) || null,
    };
}

module.exports = {
    fetchApiBibleChapter,
    parseApiBibleChapter,
    stripVerseHtml,
    BOOK_CODES,
};
