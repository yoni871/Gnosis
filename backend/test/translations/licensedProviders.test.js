const test = require("node:test");
const assert = require("node:assert/strict");

// Explicit isolation also protects direct node --test invocations.
process.env.GNOSIS_TEST_ISOLATION = "1";
process.env.ESV_API_KEY = "test-esv-key";
process.env.API_BIBLE_KEY = "test-api-bible-key";
process.env.API_BIBLE_NIV_ID = "test-niv-id";
process.env.API_BIBLE_NKJV_ID = "test-nkjv-id";
process.env.API_BIBLE_NASB_ID = "a761ca71e0b3ddcf-01";
process.env.NLT_API_KEY = "test-nlt-key";

const {
    parseEsvPassages,
    fetchEsvChapter,
} = require("../../src/services/licensed/esvProvider");
const {
    parseApiBibleVerses,
    stripVerseHtml,
    fetchApiBibleChapter,
    BOOK_CODES,
} = require("../../src/services/licensed/apiBibleProvider");
const {
    parseNltHtml,
    fetchNltChapter,
} = require("../../src/services/licensed/nltProvider");

function fakeJsonResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    };
}

// ---------------------------------------------------------------------------
// ESV
// ---------------------------------------------------------------------------

test("ESV parser splits [N] markers, drops a leading heading, and joins wrapped lines", () => {
    const verses = parseEsvPassages([
        "The Creation of the World\n[1] In the beginning, God created\nthe heavens and the earth. [2] The earth was without form and void, and darkness was over the face of the deep.",
    ]);
    assert.deepEqual(verses, [
        { verse_number: 1, text: "In the beginning, God created the heavens and the earth." },
        { verse_number: 2, text: "The earth was without form and void, and darkness was over the face of the deep." },
    ]);
});

test("ESV parser fails loudly on missing markers, gaps, and empty verses", () => {
    assert.throws(() => parseEsvPassages(["No markers here."]), /no verse markers/);
    assert.throws(
        () => parseEsvPassages(["[1] One. [3] Three."]),
        /not consecutive/
    );
    assert.throws(() => parseEsvPassages(["[1]  [2] Two."]), /empty verse/);
});

test("ESV fetch sends the key as a Token header and requests verse numbers without headings", async () => {
    let seenUrl = null;
    let seenHeaders = null;
    const fetchImpl = async (url, init) => {
        seenUrl = url;
        seenHeaders = init.headers;
        return fakeJsonResponse({ passages: ["[1] In the beginning."] });
    };
    const result = await fetchEsvChapter("Genesis", 1, { fetchImpl });
    assert.equal(result.verses.length, 1);
    assert.equal(result.verses[0].text, "In the beginning.");
    assert.match(seenUrl, /q=Genesis\+1/);
    assert.match(seenUrl, /include-verse-numbers=true/);
    assert.match(seenUrl, /include-headings=false/);
    assert.equal(seenHeaders.Authorization, "Token test-esv-key");
});

test("ESV fetch refuses without a key and reports HTTP failures", async () => {
    const saved = process.env.ESV_API_KEY;
    delete process.env.ESV_API_KEY;
    try {
        await assert.rejects(
            fetchEsvChapter("Genesis", 1, { fetchImpl: async () => fakeJsonResponse({}) }),
            /ESV_API_KEY is not configured/
        );
    } finally {
        process.env.ESV_API_KEY = saved;
    }
    await assert.rejects(
        fetchEsvChapter("Genesis", 1, { fetchImpl: async () => fakeJsonResponse({}, 429) }),
        /HTTP 429/
    );
});

// ---------------------------------------------------------------------------
// API.Bible
// ---------------------------------------------------------------------------

test("API.Bible parser strips the number span and section headings but keeps the words", () => {
    const verses = parseApiBibleVerses([
        {
            number: "1",
            content:
                '<p class="s1">The Creation of the World</p><p class="p"><span data-number="1" class="v">1</span>In the beginning God created the heavens and the earth.</p>',
        },
        {
            number: "2",
            content:
                '<p class="p"><span data-number="2" class="v">2</span>Now the earth was formless and empty.</p>',
        },
    ]);
    assert.deepEqual(verses, [
        { verse_number: 1, text: "In the beginning God created the heavens and the earth." },
        { verse_number: 2, text: "Now the earth was formless and empty." },
    ]);
});

test("API.Bible stripVerseHtml does not eat a verse that legitimately starts with a digit", () => {
    assert.equal(
        stripVerseHtml('<p class="p"><span data-number="3" class="v">3</span>2,000 men went up.</p>'),
        "2,000 men went up."
    );
});

test("API.Bible fetch adds fums-version=3, sends the api-key header, and returns the fumsToken", async () => {
    let seenUrl = null;
    let seenHeaders = null;
    const fetchImpl = async (url, init) => {
        seenUrl = url;
        seenHeaders = init.headers;
        return fakeJsonResponse({
            data: [
                { number: "1", content: '<p class="p"><span data-number="1" class="v">1</span>In the beginning.</p>' },
            ],
            meta: { fumsToken: "test-fums-token" },
        });
    };
    const result = await fetchApiBibleChapter("Genesis", 1, "test-niv-id", { fetchImpl });
    assert.equal(result.verses[0].text, "In the beginning.");
    assert.equal(result.fumsToken, "test-fums-token");
    assert.match(seenUrl, /\/bibles\/test-niv-id\/chapters\/GEN\.1\/verses\?fums-version=3/);
    assert.equal(seenHeaders["api-key"], "test-api-bible-key");
});

test("API.Bible book codes cover all 66 books exactly once", () => {
    const codes = Object.values(BOOK_CODES);
    assert.equal(codes.length, 66);
    assert.equal(new Set(codes).size, 66);
    assert.equal(BOOK_CODES.Genesis, "GEN");
    assert.equal(BOOK_CODES.Psalms, "PSA");
    assert.equal(BOOK_CODES["1 Samuel"], "1SA");
    assert.equal(BOOK_CODES["Song of Solomon"], "SNG");
    assert.equal(BOOK_CODES.Revelation, "REV");
});

// ---------------------------------------------------------------------------
// NLT
// ---------------------------------------------------------------------------

const NLT_SAMPLE = `<!DOCTYPE html><html><body>
<div id="bibletext"><section><h2 class="bk_ch_vs_header">John 3:1-3, NLT</h2>
<verse_export orig="john_3_1" bk="john" ch="3" vn="1">
<h2 class="chapter-number"><span class="cw">John</span> <span class="cw_ch">3</span></h2>
<p class="body-ch"><span class="vn">1</span>There was a man named Nicodemus, a Jewish religious leader who was a Pharisee. </verse_export>
<verse_export orig="john_3_2" bk="john" ch="3" vn="2"><span class="vn">2</span>After dark one evening, he came to speak with Jesus.</p>
</verse_export><verse_export orig="john_3_3" bk="john" ch="3" vn="3">
<p class="body"><span class="vn">3</span>Jesus replied, <span class="red">"I tell you the truth, unless you are born again,<a class="a-tn">*</a><span class="tn"><span class="tn-ref">3:3</span> Or <em>born from above;</em> also in 3:7.</span> you cannot see the Kingdom of God."</span></p>
</verse_export></section></div></body></html>`;

test("NLT parser reads verse_export blocks and drops headings, footnotes, and number spans", () => {
    const verses = parseNltHtml(NLT_SAMPLE);
    assert.deepEqual(verses, [
        { verse_number: 1, text: "There was a man named Nicodemus, a Jewish religious leader who was a Pharisee." },
        { verse_number: 2, text: "After dark one evening, he came to speak with Jesus." },
        { verse_number: 3, text: 'Jesus replied, "I tell you the truth, unless you are born again, you cannot see the Kingdom of God."' },
    ]);
});

test("NLT parser fails loudly when a verse is empty or the blocks are missing", () => {
    assert.throws(() => parseNltHtml("<html><body>No verses.</body></html>"), /no verses/);
    assert.throws(
        () => parseNltHtml('<verse_export vn="1"><span class="vn">1</span></verse_export>'),
        /empty verse/
    );
});

test("NLT fetch uses the ref=Book.Chapter form and the key query parameter", async () => {
    let seenUrl = null;
    const fetchImpl = async (url) => {
        seenUrl = url;
        return fakeJsonResponse(NLT_SAMPLE);
    };
    const result = await fetchNltChapter("John", 3, { fetchImpl });
    assert.equal(result.verses.length, 3);
    assert.match(seenUrl, /ref=John\.3/);
    assert.match(seenUrl, /key=test-nlt-key/);
});
