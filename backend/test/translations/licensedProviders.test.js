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
    parseApiBibleChapter,
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

test("ESV fetch aborts a hung provider instead of waiting forever", async () => {
    // A fetch that honours the abort signal (as the real fetch does)
    // but never otherwise resolves: the provider must give up after
    // the timeout and surface a provider failure, which the caller
    // turns into the 503 the reader answers with the BSB fallback.
    const fetchImpl = (url, init) =>
        new Promise((resolve, reject) => {
            init.signal.addEventListener("abort", () => {
                reject(new Error("This operation was aborted"));
            });
        });
    await assert.rejects(
        fetchEsvChapter("Genesis", 1, { fetchImpl, fetchTimeoutMs: 5 }),
        (error) => {
            assert.equal(error.name, "LicensedProviderError");
            assert.equal(error.code, "provider");
            assert.match(error.message, /aborted/i);
            return true;
        }
    );
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

test("API.Bible parser splits chapter HTML on verse spans, drops section headings, keeps the words", () => {
    const verses = parseApiBibleChapter(
        '<p class="s1">The Creation of the World</p>' +
            '<p class="p"><span data-number="1" data-sid="GEN 1:1" class="v">1</span>In the beginning God created the heavens and the earth.</p>' +
            '<p class="p"><span data-number="2" data-sid="GEN 1:2" class="v">2</span>Now the earth was formless and empty, darkness was over the surface of the deep, and the Spirit of God was hovering over the waters.</p>'
    );
    assert.deepEqual(verses, [
        { verse_number: 1, text: "In the beginning God created the heavens and the earth." },
        { verse_number: 2, text: "Now the earth was formless and empty, darkness was over the surface of the deep, and the Spirit of God was hovering over the waters." },
    ]);
});

test("API.Bible parser handles several verses sharing one paragraph and a heading between verses", () => {
    const verses = parseApiBibleChapter(
        '<p class="p"><span data-number="1" data-sid="GEN 1:1" class="v">1</span>First verse. ' +
            '<span data-number="2" data-sid="GEN 1:2" class="v">2</span>Second verse.</p>' +
            '<p class="s1">A Later Heading</p>' +
            '<p class="p"><span data-number="3" data-sid="GEN 1:3" class="v">3</span>Third verse.</p>'
    );
    assert.deepEqual(verses, [
        { verse_number: 1, text: "First verse." },
        { verse_number: 2, text: "Second verse." },
        { verse_number: 3, text: "Third verse." },
    ]);
});

test("API.Bible parser keeps poetry lines that span paragraphs under the same verse", () => {
    const verses = parseApiBibleChapter(
        '<p class="q1"><span data-number="1" data-sid="PSA 23:1" class="v">1</span>The Lord is my shepherd, I lack nothing.</p>' +
            '<p class="q1"><span data-number="2" data-sid="PSA 23:2" class="v">2</span>He makes me lie down in green pastures,</p>' +
            '<p class="q2">he leads me beside quiet waters,</p>'
    );
    assert.deepEqual(verses, [
        { verse_number: 1, text: "The Lord is my shepherd, I lack nothing." },
        { verse_number: 2, text: "He makes me lie down in green pastures, he leads me beside quiet waters," },
    ]);
});

test("API.Bible parser fails loudly on a chapter with no verse markers", () => {
    assert.throws(
        () => parseApiBibleChapter('<p class="s1">The Beginning</p><p class="p">No verse spans here.</p>'),
        (error) => error.code === "provider-format"
    );
});

test("API.Bible parser fails loudly when verses are not consecutive from 1", () => {
    assert.throws(
        () =>
            parseApiBibleChapter(
                '<p class="p"><span data-number="1" data-sid="GEN 1:1" class="v">1</span>First verse.</p>' +
                    '<p class="p"><span data-number="3" data-sid="GEN 1:3" class="v">3</span>Third verse.</p>'
            ),
        (error) => error.code === "provider-format"
    );
});

test("API.Bible stripVerseHtml does not eat a verse that legitimately starts with a digit", () => {
    assert.equal(
        stripVerseHtml('<p class="p"><span data-number="3" class="v">3</span>2,000 men went up.</p>'),
        "2,000 men went up."
    );
});

test("API.Bible parser keeps a word whole across a small-caps span and drops the gap before punctuation", () => {
    // Live shape, Psalm 119: the divine name rides as L<span>ord</span>,
    // and a footnote marker can sit between the word and its punctuation.
    // The old tag strip turned every tag into a space ("L ord", "Lord ;").
    const verses = parseApiBibleChapter(
        '<p class="q1"><span data-number="1" data-sid="PSA 119:1" class="v">1</span>Blessed are those whose way is blameless, who walk in the Law of the L<span class="sc">ord</span>.</p>' +
            '<p class="q1"><span data-number="2" data-sid="PSA 119:2" class="v">2</span>Praise be to you, L<span class="sc">ord</span> <span class="f"></span>; teach me your decrees.</p>'
    );
    assert.deepEqual(verses, [
        { verse_number: 1, text: "Blessed are those whose way is blameless, who walk in the Law of the Lord." },
        { verse_number: 2, text: "Praise be to you, Lord; teach me your decrees." },
    ]);
});

test("API.Bible stripVerseHtml keeps quoted small-caps words whole, drops a footnote before punctuation, and keeps paragraph breaks as spaces", () => {
    // Live shape, NASB John 1:23: the quoted Isaiah passage is small caps.
    assert.equal(
        stripVerseHtml(
            'He said, “I am the voice of one calling out in the wilderness, ‘M<span class="sc">ake</span> the way of the L<span class="sc">ord</span> straight,’ as Isaiah said.”'
        ),
        "He said, “I am the voice of one calling out in the wilderness, ‘Make the way of the Lord straight,’ as Isaiah said.”"
    );
    // A footnote marker (empty element; include-notes=false sends no
    // marker text) between a word and its comma leaves no gap.
    assert.equal(
        stripVerseHtml('Praise be to you, Lord <span class="f"></span>, teach me your decrees.'),
        "Praise be to you, Lord, teach me your decrees."
    );
    // An entity-decoded comma after a space is still joined to its word.
    assert.equal(
        stripVerseHtml("Blessed are you, L<span>ord</span> &#44; teach me."),
        "Blessed are you, Lord, teach me."
    );
    // A paragraph boundary is still a space, not a join.
    assert.equal(
        stripVerseHtml('He makes me lie down in green pastures,</p><p class="q2">he leads me beside quiet waters,'),
        "He makes me lie down in green pastures, he leads me beside quiet waters,"
    );
});

test("API.Bible stripVerseHtml gives an empty marker element a space so words do not join", () => {
    // Live shapes (NKJV): an empty cross-reference marker sits between the
    // first two words of a verse. Stripping it outright joined them, and
    // the old tag-to-space strip got these right by accident — so the
    // empty element must become a space, while a span wrapping part of a
    // word still strips with no space.
    assert.equal(
        stripVerseHtml('“Or<span class="x"></span>who has first given to Him And it shall be repaid to him?”'),
        "“Or who has first given to Him And it shall be repaid to him?”"
    );
    assert.equal(
        stripVerseHtml('‘And<span class="x"></span>it shall come to pass in the last days, says God,'),
        "‘And it shall come to pass in the last days, says God,"
    );
    assert.equal(
        stripVerseHtml('“Blessed<span class="x"></span>are the poor in spirit, For theirs is the kingdom of heaven.”'),
        "“Blessed are the poor in spirit, For theirs is the kingdom of heaven.”"
    );
    assert.equal(
        stripVerseHtml('Who walk in the Law of the L<span class="sc">ord</span>.'),
        "Who walk in the Law of the Lord."
    );
    assert.equal(
        stripVerseHtml('Praise be to you, Lord<span class="f"></span>; teach me.'),
        "Praise be to you, Lord; teach me."
    );
});

test("API.Bible stripVerseHtml gives invisible markup a space so words do not join", () => {
    // An HTML comment carrying no verse text between two words, and a tag
    // that opens but never closes in this fragment, both joined the words
    // when stripped outright ("Orwho"). They become a space instead.
    assert.equal(
        stripVerseHtml('“Or<!-- cross-ref -->who has first given to Him And it shall be repaid to him?”'),
        "“Or who has first given to Him And it shall be repaid to him?”"
    );
    assert.equal(
        stripVerseHtml('“Or<span class="x">who has first given to Him And it shall be repaid to him?”'),
        "“Or who has first given to Him And it shall be repaid to him?”"
    );
    // ...but a tag that does close later still just wraps text and drops:
    assert.equal(
        stripVerseHtml('Who walk in the Law of the L<span class="sc">ord</span>.'),
        "Who walk in the Law of the Lord."
    );
    assert.equal(
        stripVerseHtml('Praise be to you, Lord<span class="f"></span>; teach me.'),
        "Praise be to you, Lord; teach me."
    );
});

test("API.Bible stripVerseHtml gives a stray closing tag between two words a space", () => {
    // A span can open before this verse's first word (in an earlier verse)
    // and close right after it: "Or</span>who". Dropping the closer joined
    // the words, and the deployed PR #45 code still showed "Orwho" live.
    assert.equal(
        stripVerseHtml('“Or</span>who has first given to Him And it shall be repaid to him?”'),
        "“Or who has first given to Him And it shall be repaid to him?”"
    );
    assert.equal(
        stripVerseHtml('‘And</a>it shall come to pass in the last days, says God.'),
        "‘And it shall come to pass in the last days, says God."
    );
    // ...but a closer that is NOT between two words still just drops:
    assert.equal(
        stripVerseHtml('Who walk in the Law of the L<span class="sc">ord</span>.'),
        "Who walk in the Law of the Lord."
    );
    assert.equal(
        stripVerseHtml('Praise be to you, Lord<span class="f"></span>; teach me.'),
        "Praise be to you, Lord; teach me."
    );
});

test("API.Bible stripVerseHtml repairs a verse-start join with no markup between the words", () => {
    // When the provider drops the cross-reference marker entirely there is
    // no tag to turn into a space, so "Orwho" and "Andit" survive every
    // markup fix. The repair splits only the verse's first word, and only
    // into a common verse-start word plus a common word.
    assert.equal(
        stripVerseHtml('“Orwho has first given to Him And it shall be repaid to him?”'),
        "“Or who has first given to Him And it shall be repaid to him?”"
    );
    assert.equal(
        stripVerseHtml('‘Andit shall come to pass in the last days, says God.'),
        "‘And it shall come to pass in the last days, says God."
    );
    // ...but a proper name at a verse start does not split, and neither
    // does a genuine compound word mid-verse:
    assert.equal(
        stripVerseHtml('These things took place in Bethany beyond the Jordan.'),
        "These things took place in Bethany beyond the Jordan."
    );
    assert.equal(
        stripVerseHtml('For if the firstfruit is holy, the lump is also holy.'),
        "For if the firstfruit is holy, the lump is also holy."
    );
    assert.equal(
        stripVerseHtml('Who walk in the Law of the L<span class="sc">ord</span>.'),
        "Who walk in the Law of the Lord."
    );
});

test("API.Bible fetch calls the chapter endpoint with pinned params, sends the api-key header, and returns the fumsToken", async () => {
    let seenUrl = null;
    let seenHeaders = null;
    const fetchImpl = async (url, init) => {
        seenUrl = url;
        seenHeaders = init.headers;
        return fakeJsonResponse({
            data: {
                content:
                    '<p class="p"><span data-number="1" data-sid="GEN 1:1" class="v">1</span>In the beginning.</p>',
            },
            meta: { fumsToken: "test-fums-token" },
        });
    };
    const result = await fetchApiBibleChapter("Genesis", 1, "test-niv-id", { fetchImpl });
    assert.equal(result.verses[0].text, "In the beginning.");
    assert.equal(result.fumsToken, "test-fums-token");
    assert.match(seenUrl, /\/bibles\/test-niv-id\/chapters\/GEN\.1\?/);
    assert.match(seenUrl, /content-type=html/);
    assert.match(seenUrl, /include-verse-numbers=true/);
    assert.match(seenUrl, /include-chapter-numbers=false/);
    assert.match(seenUrl, /include-notes=false/);
    assert.match(seenUrl, /fums-version=3/);
    assert.doesNotMatch(seenUrl, /\/verses/);
    assert.equal(seenHeaders["api-key"], "test-api-bible-key");
});

test("API.Bible fetch fails loudly on a list-shaped payload with no chapter content (issue #35)", async () => {
    const fetchImpl = async () =>
        fakeJsonResponse({
            data: [
                { id: "GEN.1.1", number: "1", reference: "Genesis 1:1" },
                { id: "GEN.1.2", number: "2", reference: "Genesis 1:2" },
            ],
            meta: {},
        });
    await assert.rejects(
        fetchApiBibleChapter("Genesis", 1, "test-niv-id", { fetchImpl }),
        (error) => error.code === "provider-format"
    );
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

test("NLT fetch uses the ref=Book.Chapter form, pins version=NLT, and the key query parameter", async () => {
    let seenUrl = null;
    const fetchImpl = async (url) => {
        seenUrl = url;
        return fakeJsonResponse(NLT_SAMPLE);
    };
    const result = await fetchNltChapter("John", 3, { fetchImpl });
    assert.equal(result.verses.length, 3);
    assert.match(seenUrl, /ref=John\.3/);
    assert.match(seenUrl, /version=NLT/);
    assert.match(seenUrl, /key=test-nlt-key/);
});
