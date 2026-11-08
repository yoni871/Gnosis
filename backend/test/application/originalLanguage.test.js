const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Explicit isolation also protects direct node --test invocations.
process.env.GNOSIS_TEST_ISOLATION = "1";
process.env.JWT_SECRET = "synthetic-jwt-secret-for-tests-only";
process.env.RATE_LIMIT_KEY_SECRET = "synthetic-rate-limit-secret-for-tests-only";
// Issue #9: app.js validates email configuration at import time.
process.env.RESEND_API_KEY = "synthetic-resend-key";
process.env.EMAIL_FROM = 'Gnosis Test <test@example.invalid>';
process.env.FRONTEND_URL = 'https://frontend.example.invalid';

const app = require("../../src/app");
const pool = require("../../src/db/db");
const {
    parseTahotLine, parseMorphologyCodeFile, parseMorphologyExpansion,
    grammarDisplayForMorphemes, morphologyLookupKey, wordLanguageForWord,
} = require("../../src/importer/importOriginalLanguage");

// Canned passage rows built from the real Genesis 1:1 fixture, so the
// API test asserts against verified source data, not invented words.
const fixtures = path.join(__dirname, "..", "fixtures", "original-language");
const readFixture = name => fs.readFileSync(path.join(fixtures, name), "utf8");
const tehmc = parseMorphologyCodeFile(readFixture("tehmc-sample.txt"));

// Build passage rows from a fixture the way the importer does: parse
// each line, expand its morphology codes (falling back to the raw code
// when the sample expansions do not cover it, as the importer does),
// and set the word language with the importer's own range logic.
function fixtureRows(file, { bookId, chapter, verse, bookName }) {
    return readFixture(file)
        .split(/\r?\n/)
        .filter(line => line && !line.startsWith("#"))
        .map(parseTahotLine)
        .map((word, index) => {
            const morphemes = word.morphemes.map((morpheme, i) => ({
                ...morpheme,
                expansion: tehmc.get(morphologyLookupKey(morpheme.morphologyCode, word.languageLetter, i === 0))
                    || morpheme.morphologyCode,
            }));
            return {
                id: index + 1,
                book_id: bookId,
                chapter_number: chapter,
                verse_number: verse,
                word_index: word.wordIndex,
                language: wordLanguageForWord(
                    { source: "tahot", language: "hebrew", name: bookName }, word),
                word_text: word.wordText,
                transliteration: word.transliteration,
                gloss: word.gloss,
                strong_number: word.rootStrong,
                strong_base: word.rootStrong.replace(/[A-Z]$/, ""),
                lemma: word.morphemes.find(m => m.isRoot)?.expandedTag || "",
                lemma_transliteration: "",
                meaning: word.gloss,
                lexical_morphology: "",
                morphology_code: word.morphemes.map(m => m.morphologyCode).join("/"),
                grammar_display: grammarDisplayForMorphemes(morphemes),
                morphemes: morphemes.map(m => ({
                    text: m.text, transliteration: m.transliteration, gloss: m.gloss,
                    strongNumber: m.strongNumber, morphologyCode: m.morphologyCode,
                    morphologyExpanded: m.expansion, isRoot: m.isRoot,
                })),
            };
        });
}

function passageRows() {
    return readFixture("tahot-gen-1-1.txt")
        .split(/\r?\n/)
        .filter(line => line && !line.startsWith("#"))
        .map(parseTahotLine)
        .map((word, index) => {
            const morphemes = word.morphemes.map((morpheme, i) => ({
                ...morpheme,
                expansion: tehmc.get(morphologyLookupKey(morpheme.morphologyCode, word.languageLetter, i === 0)),
            }));
            return {
                id: index + 1,
                book_id: 1,
                chapter_number: 1,
                verse_number: 1,
                word_index: word.wordIndex,
                language: "hebrew",
                word_text: word.wordText,
                transliteration: word.transliteration,
                gloss: word.gloss,
                strong_number: word.rootStrong,
                strong_base: word.rootStrong.replace(/[A-Z]$/, ""),
                lemma: word.morphemes.find(m => m.isRoot)?.expandedTag || "",
                lemma_transliteration: "",
                meaning: word.gloss,
                lexical_morphology: "",
                morphology_code: word.morphemes.map(m => m.morphologyCode).join("/"),
                grammar_display: grammarDisplayForMorphemes(morphemes),
                morphemes: morphemes.map(m => ({
                    text: m.text, transliteration: m.transliteration, gloss: m.gloss,
                    strongNumber: m.strongNumber, morphologyCode: m.morphologyCode,
                    morphologyExpanded: m.expansion, isRoot: m.isRoot,
                })),
            };
        });
}

const SOURCES = [
    { code: "STEPBible-TAHOT", name: "Translators Amalgamated Hebrew Old Testament (TAHOT)",
        url: "https://github.com/STEPBible/STEPBible-Data", license: "CC BY 4.0",
        attribution: "Original-language data: STEPBible (Tyndale House / STEPBible.org), CC BY 4.0",
        text_edition: "Leningrad Codex via Westminster Leningrad Codex 4.20", language: "hebrew" },
];

let passageParams = null;
let titleParams = null;
let occurrencesParams = null;

const queryMock = test.mock.method(pool, "query", async (sql, params = []) => {
    if (typeof sql === "string" && sql.includes("FROM bible_books WHERE name")) {
        if (params[0] === "Genesis") return { rows: [{ id: 1, name: "Genesis", testament: "OT" }] };
        if (params[0] === "Philippians") return { rows: [{ id: 50, name: "Philippians", testament: "NT" }] };
        if (params[0] === "Psalms") return { rows: [{ id: 20, name: "Psalms", testament: "OT" }] };
        if (params[0] === "Daniel") return { rows: [{ id: 28, name: "Daniel", testament: "OT" }] };
        return { rows: [] };
    }
    if (typeof sql === "string" && sql.includes("FROM ol_sources WHERE code")) {
        return { rows: SOURCES };
    }
    if (typeof sql === "string" && sql.includes("WHERE w.id = $1")) {
        const rows = passageRows();
        return { rows: params[0] === 1 ? [{ ...rows[0], book: "Genesis" }] : [] };
    }
    if (typeof sql === "string" && sql.includes("FROM ol_lexical_entries WHERE strong_number")) {
        if (params[0] === "H7225G") {
            return { rows: [{ strong_number: "H7225G", strong_base: "H7225", language: "hebrew",
                lemma: "רֵאשִׁית", transliteration: "re.shit", gloss: "first: beginning", lexical_morphology: "H:N-F" }] };
        }
        return { rows: [] };
    }
    if (typeof sql === "string" && sql.includes("count(*)::int AS total")) {
        return { rows: [{ total: 1 }] };
    }
    if (typeof sql === "string" && sql.includes("ORDER BY b.book_order")) {
        occurrencesParams = params;
        return { rows: [{ id: 1, book_id: 1, chapter_number: 1, verse_number: 1, word_index: 1,
            language: "hebrew", word_text: "בְּרֵאשִׁית", transliteration: "be.re.Shit",
            gloss: "in beginning", strong_number: "H7225G", grammar_display: "Preposition + Noun",
            strong_base: "H7225", lemma: "רֵאשִׁית", book: "Genesis" }] };
    }
    if (typeof sql === "string" && sql.includes("unnest($1::int[]")) {
        return { rows: passageRows().map(row => ({
            book_id: 1, chapter_number: 1, verse_number: 1,
            word_index: row.word_index, word_text: row.word_text,
        })) };
    }
    if (typeof sql === "string" && sql.includes("FROM ol_word_occurrences w")) {
        // The title query (verse_number = 0) is checked first: it
        // shares the passage query's FROM clause.
        if (sql.includes("verse_number = 0")) {
            titleParams = params;
            if (params[0] === 20 && params[1] === 3) {
                return { rows: fixtureRows("tahot-psa-3-0.txt",
                    { bookId: 20, chapter: 3, verse: 0, bookName: "Psalms" }) };
            }
            return { rows: [] };
        }
        passageParams = params;
        // Genesis 1 is imported; Genesis 2 is not (Phase 1 coverage).
        if (params[0] === 1 && params[1] === 1) return { rows: passageRows() };
        if (params[0] === 20 && params[1] === 3 && params[2] === 1 && params[3] === 1) {
            return { rows: fixtureRows("tahot-psa-3-1.txt",
                { bookId: 20, chapter: 3, verse: 1, bookName: "Psalms" }) };
        }
        if (params[0] === 28 && params[1] === 2 && params[2] === 4 && params[3] === 4) {
            return { rows: fixtureRows("tahot-dan-2-4.txt",
                { bookId: 28, chapter: 2, verse: 4, bookName: "Daniel" }) };
        }
        return { rows: [] };
    }
    throw new Error(`Unexpected query in original-language test: ${sql}`);
});

let server;
let baseUrl;

test.before(async () => {
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    queryMock.mock.restore();
    await pool.end();
});

test.beforeEach(() => {
    passageParams = null;
    titleParams = null;
    occurrencesParams = null;
});

async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        ...options, headers: { Connection: "close", ...options.headers },
    });
    const text = await response.text();
    return { response, text, json: text ? JSON.parse(text) : null };
}

test("GET passage returns the imported words in order with attribution", async () => {
    const { response, json } = await request("/api/original-language/Genesis/1?startVerse=1&endVerse=1");
    assert.equal(response.status, 200);
    assert.equal(json.book, "Genesis");
    assert.equal(json.chapter, 1);
    assert.equal(json.language, "hebrew");
    assert.equal(json.available, true);
    assert.equal(json.verses.length, 1);
    assert.equal(json.verses[0].verse, 1);
    assert.equal(json.verses[0].words.length, 7);
    assert.equal(json.verses[0].words[0].wordText, passageRows()[0].word_text);
    assert.equal(json.verses[0].words[0].strongNumber, "H7225G");
    assert.equal(json.verses[0].words[0].language, "hebrew");
    assert.equal(json.verses[0].words[0].grammarDisplay, "Preposition + Noun · Common · Feminine · Singular · Absolute");
    assert.deepEqual(json.languages, ["hebrew"]);
    // Genesis 1 has no chapter title: the title query ran and found
    // nothing, so the response carries an explicit null, not a verse 0.
    assert.deepEqual(titleParams, [1, 1]);
    assert.equal(json.title, null);
    assert.equal(json.sources[0].code, "STEPBible-TAHOT");
    assert.equal(json.sources[0].license, "CC BY 4.0");
    assert.deepEqual(passageParams, [1, 1, 1, 1]);
});

test("GET passage returns the Psalm title separately, never as verse 1", async () => {
    const { response, json } = await request("/api/original-language/Psalms/3?startVerse=1&endVerse=1");
    assert.equal(response.status, 200);
    assert.equal(json.book, "Psalms");
    assert.equal(json.available, true);
    assert.deepEqual(json.languages, ["hebrew"]);
    // The title is its own object with the 6 superscription words.
    assert.equal(json.title.words.length, 6);
    assert.equal(json.title.words[0].wordText, "מִזְמ֥וֹר");
    assert.equal(json.title.words[0].gloss, "a psalm");
    assert.equal(json.title.words[0].language, "hebrew");
    // The verses carry only verse 1 — no verse 0 group, and the title
    // words are not duplicated into it.
    assert.equal(json.verses.length, 1);
    assert.equal(json.verses[0].verse, 1);
    assert.equal(json.verses[0].words.length, 7);
    assert.ok(!json.verses.some(verse => verse.verse === 0));
    assert.deepEqual(titleParams, [20, 3]);
});

test("GET passage does not fetch the title when the range starts after verse 1", async () => {
    const { response, json } = await request("/api/original-language/Psalms/3?startVerse=2&endVerse=2");
    assert.equal(response.status, 200);
    assert.equal(json.available, false);
    assert.equal(json.title, null);
    assert.equal(titleParams, null);
});

test("GET passage lists both languages of a mixed Hebrew/Aramaic verse", async () => {
    const { response, json } = await request("/api/original-language/Daniel/2?startVerse=4&endVerse=4");
    assert.equal(response.status, 200);
    assert.equal(json.available, true);
    assert.deepEqual(json.languages, ["hebrew", "aramaic"]);
    assert.equal(json.verses.length, 1);
    assert.equal(json.verses[0].words.length, 12);
    // Words 1–4 Hebrew, words 5–12 Aramaic: the verse is never
    // classified as one language.
    const languages = json.verses[0].words.map(word => word.language);
    assert.deepEqual(languages.slice(0, 4), ["hebrew", "hebrew", "hebrew", "hebrew"]);
    assert.deepEqual(languages.slice(4), Array(8).fill("aramaic"));
    assert.equal(json.verses[0].words[3].wordText, "אֲרָמִ֑ית");
    assert.equal(json.verses[0].words[4].wordText, "מַלְכָּא֙");
});

test("GET passage defaults to a single verse and caps the range", async () => {
    const { response, json } = await request("/api/original-language/Genesis/1");
    assert.equal(response.status, 200);
    assert.equal(json.startVerse, 1);
    assert.equal(json.endVerse, 1);
    const tooWide = await request("/api/original-language/Genesis/1?startVerse=1&endVerse=51");
    assert.equal(tooWide.response.status, 400);
    assert.match(tooWide.json.error, /At most 50 verses/);
});

test("GET passage rejects bad chapter and verse numbers", async () => {
    for (const path of [
        "/api/original-language/Genesis/abc",
        "/api/original-language/Genesis/1?startVerse=0",
        "/api/original-language/Genesis/1?startVerse=2&endVerse=1",
        "/api/original-language/Genesis/1?startVerse=1&endVerse=177",
        "/api/original-language/Genesis/151",
    ]) {
        const { response } = await request(path);
        assert.equal(response.status, 400, path);
    }
});

test("GET passage returns 404 for an unknown book and available:false for an unimported chapter", async () => {
    const unknown = await request("/api/original-language/UnknownBook/1");
    assert.equal(unknown.response.status, 404);
    const unimported = await request("/api/original-language/Genesis/2");
    assert.equal(unimported.response.status, 200);
    assert.equal(unimported.json.available, false);
    assert.deepEqual(unimported.json.verses, []);
    assert.match(unimported.json.note, /Genesis 1 and Philippians 3 only/);
});

test("GET word returns the word detail with lemma and morphemes", async () => {
    const { response, json } = await request("/api/original-language/words/1");
    assert.equal(response.status, 200);
    assert.equal(json.book, "Genesis");
    assert.equal(json.chapter, 1);
    assert.equal(json.verse, 1);
    assert.equal(json.wordText, passageRows()[0].word_text);
    assert.equal(json.strongNumber, "H7225G");
    assert.equal(json.strongBase, "H7225");
    assert.equal(json.grammarDisplay, "Preposition + Noun · Common · Feminine · Singular · Absolute");
    assert.equal(json.morphemes.length, 2);
    assert.equal(json.morphemes[1].strongNumber, "H7225G");
    assert.equal(json.sources[0].license, "CC BY 4.0");
});

test("GET word rejects a bad id and 404s a missing word", async () => {
    assert.equal((await request("/api/original-language/words/abc")).response.status, 400);
    assert.equal((await request("/api/original-language/words/999")).response.status, 404);
});

test("GET occurrences returns lemma matches with original-language context", async () => {
    const { response, json } = await request("/api/original-language/lemmas/H7225G/occurrences");
    assert.equal(response.status, 200);
    assert.equal(json.strong, "H7225G");
    assert.equal(json.strongBase, "H7225");
    assert.equal(json.match, "lemma");
    assert.equal(json.total, 1);
    assert.equal(json.occurrences.length, 1);
    assert.equal(json.occurrences[0].book, "Genesis");
    assert.equal(json.occurrences[0].verse, 1);
    assert.equal(json.occurrences[0].wordText, "בְּרֵאשִׁית");
    assert.deepEqual(json.occurrences[0].context.before, []);
    assert.equal(json.occurrences[0].context.after.length, 3);
    assert.match(json.corpus, /Genesis 1 and Philippians 3 only/);
    assert.equal(json.sources[0].license, "CC BY 4.0");
    assert.deepEqual(occurrencesParams.slice(0, 1), ["H7225G"]);
});

test("GET occurrences validates the Strong's number, match, limit and offset", async () => {
    assert.equal((await request("/api/original-language/lemmas/XYZ/occurrences")).response.status, 400);
    assert.equal((await request("/api/original-language/lemmas/H7225/occurrences?limit=0")).response.status, 400);
    assert.equal((await request("/api/original-language/lemmas/H7225/occurrences?limit=101")).response.status, 400);
    assert.equal((await request("/api/original-language/lemmas/H7225/occurrences?offset=-1")).response.status, 400);
    const strong = await request("/api/original-language/lemmas/h7225g/occurrences?match=strong");
    assert.equal(strong.response.status, 200);
    assert.equal(strong.json.match, "strong");
    assert.equal(strong.json.strong, "H7225G");
});

test("GET occurrences 404s a Strong's number with no lexical entry", async () => {
    const { response } = await request("/api/original-language/lemmas/G9999/occurrences");
    assert.equal(response.status, 404);
});

test("word and lemma routes are not swallowed by the passage route", async () => {
    // If "/:book/:chapter" matched first, /words/1 would 404 as book "words".
    const { response } = await request("/api/original-language/words/1");
    assert.equal(response.status, 200);
});
