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

const { contextFromEnvironment, createTestPool, installApplicationPool } = require("../helpers/application-database");
const { startBackend } = require("../helpers/backend-instance");

const context = contextFromEnvironment();
let database;
let worker;
let bibleService;

test.before(async () => {
    database = await createTestPool(context);
    installApplicationPool(database.pool);
    bibleService = require("../../src/services/bibleService");
    worker = await startBackend(context);
});
test.after(async () => {
    if (worker) await worker.stop();
    if (database) await database.close();
});

async function getChapter(book, chapter = 1, translation = "KJV") {
    const response = await fetch(
        `${worker.url}/api/bible/${encodeURIComponent(book)}/${chapter}/${translation}`,
        { signal: AbortSignal.timeout(15000) }
    );
    return { status: response.status, body: await response.json() };
}

// The fixture book is "Synthetic harness book" (chapter 1, 3 verses,
// joined to the stored KJV translation by the application fixture),
// so every casing of its name must resolve to it.
test("resolveBookName matches any casing of a canonical name", async () => {
    for (const spelling of [
        "Synthetic harness book",
        "synthetic harness book",
        "SYNTHETIC HARNESS BOOK",
        "Synthetic Harness Book",
    ]) {
        const row = await bibleService.resolveBookName(spelling);
        assert.equal(row?.name, "Synthetic harness book", spelling);
    }
});

test("resolveBookName trims whitespace and returns null for unknown or empty names", async () => {
    assert.equal(
        (await bibleService.resolveBookName("  synthetic harness book  "))?.name,
        "Synthetic harness book"
    );
    assert.equal(await bibleService.resolveBookName("Not A Book"), null);
    assert.equal(await bibleService.resolveBookName(""), null);
    assert.equal(await bibleService.resolveBookName("   "), null);
    // Abbreviations are not resolved — only full canonical names.
    assert.equal(await bibleService.resolveBookName("Syn"), null);
});

test("lowercase, uppercase, and mixed-case book names return the chapter", async () => {
    for (const spelling of [
        "synthetic harness book",
        "SYNTHETIC HARNESS BOOK",
        "Synthetic Harness Book",
        "Synthetic harness book",
    ]) {
        const { status, body } = await getChapter(spelling);
        assert.equal(status, 200, spelling);
        assert.equal(body.length, 3, spelling);
        assert.deepEqual(body.map((verse) => verse.verse_number), [1, 2, 3]);
        assert.ok(body.every((verse) => verse.book === "Synthetic harness book"), spelling);
        assert.ok(body.every((verse) => verse.chapter_number === 1), spelling);
    }
});

test("unknown books, chapters, and translations still 404", async () => {
    for (const [book, chapter, translation] of [
        ["Not A Book", 1, "KJV"],
        ["Synthetic harness book", 99, "KJV"],
        ["Synthetic harness book", 1, "BOGUS"],
    ]) {
        const { status, body } = await getChapter(book, chapter, translation);
        assert.equal(status, 404, `${book} ${chapter} ${translation}`);
        assert.equal(body.error, "Chapter not found.");
    }
});

test("the study lookup works with the resolved canonical name", async () => {
    // Service-level: the study lookup keys on the book name too, so
    // it takes the same canonical name the chapter endpoint uses.
    const canonical = await bibleService.resolveBookName("synthetic harness book");
    assert.equal(canonical?.name, "Synthetic harness book");
    const result = await bibleService.getStudyByChapter(canonical.name, 1, 1);
    assert.equal(result.verses.rows.length, 3);
    assert.ok(result.verses.rows.every((verse) => verse.book === "Synthetic harness book"));
});

test("the /study URL still 404s (pre-existing route shadowing, out of scope)", async () => {
    // /bible/:book/:chapter/:translation is registered before
    // /bible/:book/:chapter/study, so "study" is read as the
    // translation and the study handler is never reached — true since
    // the initial commit, and no caller uses the endpoint. This PR
    // does not change routing; the assertion pins the current
    // behavior so a future route-order fix shows up here.
    const response = await fetch(
        `${worker.url}/api/bible/${encodeURIComponent("synthetic harness book")}/1/study?commentaryId=1`,
        { signal: AbortSignal.timeout(15000) }
    );
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, "Chapter not found.");
});
