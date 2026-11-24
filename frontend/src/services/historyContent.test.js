// Content-pipeline tests: validation (fail closed) and published-only
// generation (the publication gate). Fixtures are copies of the real
// shipped content tree, mutated per case, so the shipped Creation content
// is itself under test.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import bibleChapters from "../data/bibleChapters.json";
import {
    findNonPublishedIds,
    generateHistoryContent,
    validateHistoryContent,
} from "../../scripts/history-content-lib";
import { formatScriptureRange, parseHistoryMarkdown, resolveHistoryFootnotes } from "../utils/historyContent";
import {
    allIds,
    allRecords,
    bookById,
    citedSourceIds,
    nonPublishedIds,
    publishedIds,
    publishedRecords,
    readTreeInventory,
} from "./historyTestHelpers";

// Approved inventory — edit only when Yonatan approves a new
// book/category. Independent of the tree-derived expectations below:
// this fails loudly if an approved category ever disappears from the
// published manifest, even though the derived lists would follow the
// tree.
const APPROVED_CATEGORIES = [
    "category-abraham-and-sarah",
    "category-building-the-tabernacle",
    "category-covenant-and-gods-law",
    "category-isaac-jacob-and-esau",
    "category-israel-in-the-wilderness",
    "category-joseph-and-israel-in-egypt",
    "category-nations-and-babel",
    "category-oppression-and-moses-early-life",
    "category-passover-and-the-exodus",
    "category-pharaoh-and-the-ten-plagues",
    "category-tabernacle-and-israels-rebellion",
];

const here = path.dirname(fileURLToPath(import.meta.url));
const repoContentDir = path.resolve(here, "../content/history");
const tempDirs = [];
afterEach(() => {
    while (tempDirs.length > 0) rmSync(tempDirs.pop(), { recursive: true, force: true });
});

function makeTempTree({ eventStatus = "published", markSourcesVerified = true } = {}) {
    const dir = mkdtempSync(path.join(tmpdir(), "history-content-"));
    tempDirs.push(dir);
    const contentDir = path.join(dir, "content");
    cpSync(repoContentDir, contentDir, { recursive: true });
    const eventPath = path.join(contentDir, "events", "creation.json");
    const event = JSON.parse(readFileSync(eventPath, "utf8"));
    event.status = eventStatus;
    writeFileSync(eventPath, JSON.stringify(event, null, 2));
    // By default the fixture registry marks every source verified, so
    // fail-closed mutations are not confounded by check 10 (a published
    // event citing a not-independently-verified source without an
    // editorial override fails validation). Pass markSourcesVerified:
    // false to keep the shipped verification states — the check-10
    // override tests do that, so the shipped Brown record stays
    // not-independently-verified in the fixture.
    if (markSourcesVerified) {
        const registryPath = path.join(contentDir, "sources", "references.json");
        const registry = JSON.parse(readFileSync(registryPath, "utf8"));
        for (const source of Object.values(registry)) {
            source.verification = "verified";
        }
        writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    }
    return { contentDir, outDir: path.join(dir, "generated") };
}

function mutateJson(contentDir, relativePath, mutate) {
    const file = path.join(contentDir, relativePath);
    const data = JSON.parse(readFileSync(file, "utf8"));
    mutate(data);
    writeFileSync(file, JSON.stringify(data, null, 2));
}

function mutateMd(contentDir, relativePath, replacement) {
    writeFileSync(path.join(contentDir, relativePath), replacement);
}

describe("validateHistoryContent on the shipped tree", () => {
    it("passes the real published Creation content with its editorial override", () => {
        const event = JSON.parse(readFileSync(path.join(repoContentDir, "events", "creation.json"), "utf8"));
        expect(event.status).toBe("published");
        expect(event.review.editorialOverride).toBe(true);
        const registry = JSON.parse(readFileSync(path.join(repoContentDir, "sources", "references.json"), "utf8"));
        // Brown is the only cited source still not-independently-verified;
        // the override is what lets the published event cite him (check 10).
        expect(registry["source-brown-cosmic-temple"].verification).toBe("not-independently-verified");
        expect(event.sources).toContain("source-brown-cosmic-temple");
        const { errors } = validateHistoryContent({ contentDir: repoContentDir, bibleChapters });
        expect(errors).toEqual([]);
    });

    it("passes a published temp-tree copy with the shipped verification states and the override intact", () => {
        const { contentDir } = makeTempTree({ eventStatus: "published", markSourcesVerified: false });
        const { errors } = validateHistoryContent({ contentDir, bibleChapters });
        expect(errors).toEqual([]);
    });

    it("fails check 10 when the same published event has no editorial override", () => {
        const { contentDir } = makeTempTree({ eventStatus: "published", markSourcesVerified: false });
        mutateJson(contentDir, "events/creation.json", (event) => {
            event.review.editorialOverride = false;
        });
        const { errors } = validateHistoryContent({ contentDir, bibleChapters });
        expect(errors.some((error) => /published event cites not-independently-verified source "source-brown-cosmic-temple" without a review\.editorialOverride/.test(error))).toBe(true);
    });
});

describe("generateHistoryContent — the publication gate", () => {
    it("generates a published event in production mode", () => {
        const { contentDir, outDir } = makeTempTree({ eventStatus: "published" });
        const tree = readTreeInventory(contentDir);
        const { manifest } = generateHistoryContent({
            contentDir, outputDir: outDir, includeUnpublished: false, bibleChapters,
        });
        expect(manifest.events).toEqual(publishedIds(tree.events));
        expect(manifest.categories).toEqual(publishedIds(tree.categories));
        expect(manifest.categories).toEqual(expect.arrayContaining(APPROVED_CATEGORIES));
        expect(manifest.books).toEqual(publishedIds(tree.books));
        expect(existsSync(path.join(outDir, "events", "adam-and-eve.json"))).toBe(true);
        expect(existsSync(path.join(outDir, "events", "creation.json"))).toBe(true);
        expect(existsSync(path.join(outDir, "events", "creation.md"))).toBe(true);
    });
    it("excludes a draft event from production generation", () => {
        const { contentDir, outDir } = makeTempTree({ eventStatus: "draft" });
        const tree = readTreeInventory(contentDir);
        const { manifest } = generateHistoryContent({
            contentDir, outputDir: outDir, includeUnpublished: false, bibleChapters,
        });
        // The fixture flips Creation to "draft"; the shipped Adam and
        // Eve, Cain and Abel, Cain's Descendants, Seth, Humanity's
        // Corruption, Noah, Great Flood, Noah's Sacrifice and God's
        // Covenant, and Noah and His Sons events are published, so
        // production generation still includes them — only the draft is
        // excluded.
        expect(manifest.events).toEqual(publishedIds(tree.events));
        expect(manifest.books).toEqual(publishedIds(tree.books));
        expect(existsSync(path.join(outDir, "events", "adam-and-eve.json"))).toBe(true);
        expect(existsSync(path.join(outDir, "events", "creation.json"))).toBe(false);
    });
    it("includes the draft only with the local-dev opt-in", () => {
        const { contentDir, outDir } = makeTempTree({ eventStatus: "draft" });
        const tree = readTreeInventory(contentDir);
        const { manifest } = generateHistoryContent({
            contentDir, outputDir: outDir, includeUnpublished: true, bibleChapters,
        });
        // The fixture flips Creation to "draft"; the shipped Adam and Eve,
        // Cain and Abel, Cain's Descendants, Seth, Humanity's Corruption,
        // Noah, and Great Flood events are published, Noah's Sacrifice
        // and God's Covenant is published (content complete: 68 claims,
        // 14 connections, 27 sources), and Noah and His Sons is
        // published (content complete: 75 claims, 16 connections, 20 sources), so the dev
        // opt-in includes the draft plus the ten published events — and
        // the published Nations and Babel, Abraham and Sarah,
        // Isaac, Jacob, and Esau, and Joseph and Israel in Egypt
        // categories, plus the in-review Building the Tabernacle,
        // Covenant and God's Law, Israel in the Wilderness,
        // Israel's Oppression and Moses' Early Life, Passover and
        // the Exodus, Pharaoh and the Ten Plagues, and Tabernacle
        // and Israel's Rebellion categories.
        expect(manifest.events).toEqual(allIds(tree.events));
        expect(manifest.categories).toEqual(allIds(tree.categories));
        expect(manifest.categories).toEqual(expect.arrayContaining(APPROVED_CATEGORIES));
        expect(manifest.includeUnpublished).toBe(true);
    });
    it("finds non-published ids for the gate check", () => {
        const { contentDir } = makeTempTree({ eventStatus: "draft" });
        const tree = readTreeInventory(contentDir);
        // All ten shipped events are published now, and so are all
        // twenty-seven categories, so the only non-published record in this
        // fixture is the draft Creation event.
        expect(findNonPublishedIds({ contentDir })).toEqual(nonPublishedIds(tree));
    });
});

describe("generateHistoryContent — internal editorial metadata never ships", () => {
    // The source tree keeps the full review record and source
    // verification for research and validation; the generated copy must
    // contain none of it. The strip happens at generation time, so it
    // covers every build path (prebuild, the Vite gate plugin, dev-flag
    // generation). Public content — prose, connection notes, source
    // authors/titles/details/links, qualifications — must survive it.
    const generatedText = (outDir) => {
        const eventJson = readFileSync(path.join(outDir, "events", "creation.json"), "utf8");
        const sourcesJson = readFileSync(path.join(outDir, "sources.json"), "utf8");
        return { eventJson, sourcesJson };
    };

    it("strips review and verification from published generation, keeps the sources intact", () => {
        const { contentDir, outDir } = makeTempTree({ eventStatus: "published", markSourcesVerified: false });
        const tree = readTreeInventory(contentDir);
        // The validator still passes with the override in the SOURCE
        // (check 10 positive case): the strip must not break validation.
        expect(validateHistoryContent({ contentDir, bibleChapters }).errors).toEqual([]);
        const { manifest } = generateHistoryContent({
            contentDir, outputDir: outDir, includeUnpublished: false, bibleChapters,
        });
        expect(manifest.events).toEqual(publishedIds(tree.events));
        const { eventJson, sourcesJson } = generatedText(outDir);
        const event = JSON.parse(eventJson);
        expect(event).not.toHaveProperty("review");
        expect(event.title).toBe("Creation");
        expect(event.connections).toHaveLength(28);
        expect(event.sources).toHaveLength(6);
        expect(eventJson).not.toContain("Kantor");
        expect(eventJson).not.toContain("editorialOverride");
        expect(eventJson).not.toContain("not-independently-verified");
        const sources = JSON.parse(sourcesJson);
        expect(Object.keys(sources)).toEqual(citedSourceIds(publishedRecords(tree)));
        const fixtureRegistry = JSON.parse(readFileSync(path.join(contentDir, "sources", "references.json"), "utf8"));
        for (const [id, source] of Object.entries(sources)) {
            expect(source).not.toHaveProperty("verification");
            expect(source).not.toHaveProperty("verificationDetail");
            // Ten of the newly published Category 2 sources carry no
            // author in the registry (the leaner field shape from #199):
            // the strip must preserve exactly what the registry has —
            // keep an author when one exists, invent none when it does
            // not.
            if (fixtureRegistry[id].author) {
                expect(source.author).toBeTruthy();
            } else {
                expect(source).not.toHaveProperty("author");
            }
            expect(source.title).toBeTruthy();
            // Five of the newly published Adam and Eve sources carry no
            // URL in the registry (BDB, ISAW, Balogh, Kramer, Benthall):
            // the strip must preserve exactly what the registry has —
            // keep a URL when one exists, invent none when it does not.
            if (fixtureRegistry[id].url) {
                expect(source.url).toBe(fixtureRegistry[id].url);
            } else {
                expect(source).not.toHaveProperty("url");
            }
        }
        expect(sourcesJson).not.toContain("not-independently-verified");
        expect(sourcesJson).not.toContain("verificationDetail");
        // ... while the SOURCE files still carry the full record.
        const sourceEvent = JSON.parse(readFileSync(path.join(contentDir, "events", "creation.json"), "utf8"));
        expect(sourceEvent.review.editorialOverride).toBe(true);
        expect(sourceEvent.review.notes).toContain("Kantor");
        const registry = JSON.parse(readFileSync(path.join(contentDir, "sources", "references.json"), "utf8"));
        expect(registry["source-brown-cosmic-temple"].verification).toBe("not-independently-verified");
        expect(registry["source-brown-cosmic-temple"].verificationDetail).toBeTruthy();
    });

    it("strips review from dev-flag generation too", () => {
        const { contentDir, outDir } = makeTempTree({ eventStatus: "draft", markSourcesVerified: false });
        const tree = readTreeInventory(contentDir);
        const { manifest } = generateHistoryContent({
            contentDir, outputDir: outDir, includeUnpublished: true, bibleChapters,
        });
        expect(manifest.events).toEqual(allIds(tree.events));
        const event = JSON.parse(readFileSync(path.join(outDir, "events", "creation.json"), "utf8"));
        expect(event).not.toHaveProperty("review");
        expect(event.title).toBe("Creation");
    });

    it("strips claims from a published event carrying them, including unverified claims 028 and 030b", () => {
        const { contentDir, outDir } = makeTempTree({ eventStatus: "published" });
        const tree = readTreeInventory(contentDir);
        // Flip Adam and Eve to published in the fixture (sources are
        // marked verified by default, so check 10 does not block it):
        // this is the shape publication would take, and the generated
        // copy must carry none of the research claims register.
        mutateJson(contentDir, "events/adam-and-eve.json", (event) => {
            event.status = "published";
        });
        expect(validateHistoryContent({ contentDir, bibleChapters }).errors).toEqual([]);
        const { manifest } = generateHistoryContent({
            contentDir, outputDir: outDir, includeUnpublished: false, bibleChapters,
        });
        expect(manifest.events).toEqual(publishedIds(tree.events));
        expect(manifest.books).toEqual(publishedIds(tree.books));
        const eventJson = readFileSync(path.join(outDir, "events", "adam-and-eve.json"), "utf8");
        const event = JSON.parse(eventJson);
        expect(event).not.toHaveProperty("claims");
        expect(event).not.toHaveProperty("review");
        expect(event.title).toBe("Adam and Eve");
        expect(event.connections).toHaveLength(18);
        expect(event.sources).toHaveLength(16);
        expect(eventJson).not.toContain("clm-ae-028");
        expect(eventJson).not.toContain("clm-ae-030b");
        expect(eventJson).not.toContain("The serpent is Satan.");
        expect(eventJson).not.toContain("reward for obedience");
        // ... while the SOURCE file still carries the full register.
        const sourceEvent = JSON.parse(readFileSync(path.join(contentDir, "events", "adam-and-eve.json"), "utf8"));
        expect(sourceEvent.claims).toHaveLength(35);
        expect(sourceEvent.claims.find((claim) => claim.id === "clm-ae-028").claim)
            .toBe("The tree of life functioned as a reward for obedience (unmentioned until 3:22).");
        expect(sourceEvent.claims.find((claim) => claim.id === "clm-ae-030b").claim).toBe("The serpent is Satan.");
    });

    it("strips claims from dev-flag generation of the published Cain's Descendants event too", () => {
        const { contentDir, outDir } = makeTempTree({ eventStatus: "draft", markSourcesVerified: false });
        const tree = readTreeInventory(contentDir);
        const { manifest } = generateHistoryContent({
            contentDir, outputDir: outDir, includeUnpublished: true, bibleChapters,
        });
        expect(manifest.events).toEqual(allIds(tree.events));
        const eventJson = readFileSync(path.join(outDir, "events", "adam-and-eve.json"), "utf8");
        const event = JSON.parse(eventJson);
        expect(event).not.toHaveProperty("claims");
        expect(event).not.toHaveProperty("review");
        expect(event.title).toBe("Adam and Eve");
        expect(event.connections).toHaveLength(18);
        expect(event.sources).toHaveLength(16);
        expect(eventJson).not.toContain("clm-ae-028");
        expect(eventJson).not.toContain("clm-ae-030b");
        expect(eventJson).not.toContain("The serpent is Satan.");
        expect(eventJson).not.toContain("reward for obedience");
        // Cain's Descendants carries its own claims register in the
        // source, so the strip must apply to it too — and its generated
        // copy must carry no claim ids at all.
        const cainsJson = readFileSync(path.join(outDir, "events", "cains-descendants.json"), "utf8");
        const cains = JSON.parse(cainsJson);
        expect(cains).not.toHaveProperty("claims");
        expect(cains).not.toHaveProperty("review");
        expect(cains.title).toBe("Cain's Descendants");
        expect(cains.connections).toHaveLength(25);
        expect(cains.sources).toHaveLength(12);
        expect(cainsJson).not.toContain("clm-cd-");
        // ... while the SOURCE file still carries the full register.
        const sourceCains = JSON.parse(readFileSync(path.join(contentDir, "events", "cains-descendants.json"), "utf8"));
        expect(sourceCains.claims).toHaveLength(31);
        expect(sourceCains.claims.map((claim) => claim.id)).toContain("clm-cd-036");
        // Creation carries no claims array in its source, so the strip
        // is a no-op for it — and its generated copy stays claims-free.
        const creation = JSON.parse(readFileSync(path.join(outDir, "events", "creation.json"), "utf8"));
        expect(creation).not.toHaveProperty("claims");
        expect(creation).not.toHaveProperty("review");
        expect(creation.title).toBe("Creation");
    });

    it("strips claims from dev-flag generation of the published Seth event too", () => {
        const { contentDir, outDir } = makeTempTree({ eventStatus: "draft", markSourcesVerified: false });
        const tree = readTreeInventory(contentDir);
        const { manifest } = generateHistoryContent({
            contentDir, outputDir: outDir, includeUnpublished: true, bibleChapters,
        });
        expect(manifest.events).toEqual(allIds(tree.events));
        const eventJson = readFileSync(path.join(outDir, "events", "seth-early-generations.json"), "utf8");
        const event = JSON.parse(eventJson);
        expect(event).not.toHaveProperty("claims");
        expect(event).not.toHaveProperty("review");
        expect(event.title).toBe("Seth and the Early Generations");
        expect(event.connections).toHaveLength(10);
        expect(event.sources).toHaveLength(9);
        expect(eventJson).not.toContain("clm-se-001");
        expect(eventJson).not.toContain("clm-se-027");
        expect(eventJson).not.toContain("when he dies, judgment");
        // ... while the SOURCE file still carries the full register,
        // including the unresolved Jerome claim (027), which the prose
        // never asserts.
        const sourceEvent = JSON.parse(readFileSync(path.join(contentDir, "events", "seth-early-generations.json"), "utf8"));
        expect(sourceEvent.claims).toHaveLength(30);
        expect(sourceEvent.claims.find((claim) => claim.id === "clm-se-027").assessment)
            .toBe("UNRESOLVED — do not state as fact");
        expect(sourceEvent.claims.find((claim) => claim.id === "clm-se-001").assessment)
            .toBe("VERIFIED (secondary)");
    });

    it("strips claims from dev-flag generation of the published Noah event too", () => {
        const { contentDir, outDir } = makeTempTree({ eventStatus: "draft", markSourcesVerified: false });
        const tree = readTreeInventory(contentDir);
        const { manifest } = generateHistoryContent({
            contentDir, outputDir: outDir, includeUnpublished: true, bibleChapters,
        });
        expect(manifest.events).toEqual(allIds(tree.events));
        const eventJson = readFileSync(path.join(outDir, "events", "noah-ark.json"), "utf8");
        const event = JSON.parse(eventJson);
        expect(event).not.toHaveProperty("claims");
        expect(event).not.toHaveProperty("review");
        expect(event.title).toBe("Noah and the Ark");
        expect(event.connections).toHaveLength(6);
        expect(event.sources).toHaveLength(19);
        expect(eventJson).not.toContain("clm-na-001");
        expect(eventJson).not.toContain("clm-na-061");
        // ... while the SOURCE file still carries the full register.
        const sourceEvent = JSON.parse(readFileSync(path.join(contentDir, "events", "noah-ark.json"), "utf8"));
        expect(sourceEvent.claims).toHaveLength(61);
        expect(sourceEvent.claims.map((claim) => claim.id)).toContain("clm-na-034");
        expect(sourceEvent.claims.find((claim) => claim.id === "clm-na-007").assessment).toBe("debated");
    });

    it("keeps the claims register in the source files (preservation)", () => {
        const sourceEvent = JSON.parse(readFileSync(path.join(repoContentDir, "events", "adam-and-eve.json"), "utf8"));
        expect(sourceEvent.status).toBe("published");
        expect(sourceEvent.claims).toHaveLength(35);
        const ids = sourceEvent.claims.map((claim) => claim.id);
        expect(ids).toContain("clm-ae-028");
        expect(ids).toContain("clm-ae-030b");
        expect(sourceEvent.claims.find((claim) => claim.id === "clm-ae-028").assessment)
            .toBe("unverified — verification status, not a confidence label");
        expect(sourceEvent.claims.find((claim) => claim.id === "clm-ae-030b").assessment)
            .toBe("unverified — no textual basis");
        // Creation has no claims array at all — the strip must be a
        // no-op for it, never a source mutation.
        const creation = JSON.parse(readFileSync(path.join(repoContentDir, "events", "creation.json"), "utf8"));
        expect(creation).not.toHaveProperty("claims");
    });
});

describe("validateHistoryContent — fail closed", () => {
    const expectErrorMatching = (contentDir, pattern) => {
        const { errors } = validateHistoryContent({ contentDir, bibleChapters });
        expect(errors.some((error) => pattern.test(error))).toBe(true);
    };

    it("rejects a chapter outside the book", () => {
        const { contentDir } = makeTempTree();
        mutateJson(contentDir, "events/creation.json", (event) => {
            event.primaryScripture.startChapter = 99;
            event.primaryScripture.endChapter = 99;
        });
        expectErrorMatching(contentDir, /startChapter 99 is outside/);
    });
    it("rejects a same-chapter range with startVerse but no endVerse", () => {
        const { contentDir } = makeTempTree();
        mutateJson(contentDir, "events/creation.json", (event) => {
            event.primaryScripture.endChapter = 1;
            event.primaryScripture.endVerse = null;
        });
        expectErrorMatching(contentDir, /endVerse is required/);
    });
    it("rejects an unknown date type", () => {
        const { contentDir } = makeTempTree();
        mutateJson(contentDir, "events/creation.json", (event) => {
            event.date.type = "mythic";
        });
        expectErrorMatching(contentDir, /date\.type "mythic"/);
    });
    it("rejects a traditional date without its system", () => {
        const { contentDir } = makeTempTree();
        mutateJson(contentDir, "events/creation.json", (event) => {
            event.date.type = "traditional";
            event.date.traditionalSystem = null;
        });
        expectErrorMatching(contentDir, /requires traditionalSystem/);
    });
    it("rejects an unknown connection confidence", () => {
        const { contentDir } = makeTempTree();
        mutateJson(contentDir, "events/creation.json", (event) => {
            event.connections[0].confidence = "certain";
        });
        expectErrorMatching(contentDir, /confidence "certain"/);
    });
    it("rejects an unresolved footnote", () => {
        const { contentDir } = makeTempTree();
        mutateMd(contentDir, "events/creation.md", "## Overview\n\nText.[^source-nope]\n\n## Ancient World\n\n" + "word ".repeat(250) + "\n\n## Why This Context Matters\n\n" + "word ".repeat(75));
        expectErrorMatching(contentDir, /footnote \[\^source-nope\]/);
    });
    it("rejects raw HTML in Markdown", () => {
        const { contentDir } = makeTempTree();
        mutateMd(contentDir, "events/creation.md", "## Overview\n\nText with <b>bold</b>.\n\n## Ancient World\n\n" + "word ".repeat(250) + "\n\n## Why This Context Matters\n\n" + "word ".repeat(75));
        expectErrorMatching(contentDir, /raw HTML/);
    });
    it("rejects an Overview far below its word range", () => {
        const { contentDir } = makeTempTree();
        mutateMd(contentDir, "events/creation.md", "## Overview\n\nToo short.\n\n## Ancient World\n\n" + "word ".repeat(250) + "\n\n## Why This Context Matters\n\n" + "word ".repeat(75));
        expectErrorMatching(contentDir, /overview is 2 words/);
    });
    it("rejects a missing required heading", () => {
        const { contentDir } = makeTempTree();
        mutateMd(contentDir, "events/creation.md", "## Overview\n\n" + "word ".repeat(100) + "\n\n## Ancient World\n\n" + "word ".repeat(250));
        expectErrorMatching(contentDir, /missing required "## Why This Context Matters"/);
    });
    it("rejects an event not listed in any book", () => {
        const { contentDir } = makeTempTree();
        mutateJson(contentDir, "books/genesis.json", (book) => {
            book.entries = [];
        });
        expectErrorMatching(contentDir, /not listed in any book/);
    });
    it("rejects a duplicate id", () => {
        const { contentDir } = makeTempTree();
        mutateJson(contentDir, "books/genesis.json", (book) => {
            book.id = "event-creation";
        });
        expectErrorMatching(contentDir, /already used/);
    });
    it("throws from generate on any validation error (fail closed)", () => {
        const { contentDir, outDir } = makeTempTree();
        mutateJson(contentDir, "events/creation.json", (event) => {
            event.date.type = "mythic";
        });
        expect(() => generateHistoryContent({
            contentDir, outputDir: outDir, includeUnpublished: false, bibleChapters,
        })).toThrow(/validation failed/);
        expect(existsSync(path.join(outDir, "manifest.json"))).toBe(false);
    });
});

describe("shared content helpers", () => {
    it("formatScriptureRange derives labels from the four fields", () => {
        expect(formatScriptureRange({ book: "Genesis", startChapter: 1, startVerse: 1, endChapter: 2, endVerse: 3 }))
            .toBe("Genesis 1:1–2:3");
        expect(formatScriptureRange({ book: "2 Kings", startChapter: 18, startVerse: null, endChapter: 19, endVerse: null }))
            .toBe("2 Kings 18–19");
    });
    it("parseHistoryMarkdown splits on the contract headings", () => {
        const md = "## Overview\n\nOne.\n\n## Ancient World\n\n### First\n\nA.\n\n### Second\n\nB.\n\n## Why This Context Matters\n\nC.\n";
        const parsed = parseHistoryMarkdown(md);
        expect(parsed.headings).toEqual(["Overview", "Ancient World", "Why This Context Matters"]);
        expect(parsed.ancientWorldSubsections.map((s) => s.heading)).toEqual(["First", "Second"]);
        expect(parsed.whyItMatters).toBe("C.");
    });
    it("resolveHistoryFootnotes numbers citations into sources-list links", () => {
        const { markdown, footnotes } = resolveHistoryFootnotes(
            "A claim.[^source-a] Another.[^source-b] Again.[^source-a]",
            ["source-a", "source-b"],
        );
        expect(markdown).toBe("A claim.[1](#source-source-a) Another.[2](#source-source-b) Again.[1](#source-source-a)");
        expect(footnotes).toEqual([
            { key: "source-a", number: 1, known: true },
            { key: "source-b", number: 2, known: true },
        ]);
    });
    it("resolveHistoryFootnotes continues numbering from an existing list instead of restarting", () => {
        const shared = [];
        const first = resolveHistoryFootnotes("A.[^source-a]", ["source-a", "source-b"], shared);
        const second = resolveHistoryFootnotes("B.[^source-b] C.[^source-a]", ["source-a", "source-b"], shared);
        expect(first.markdown).toBe("A.[1](#source-source-a)");
        expect(second.markdown).toBe("B.[2](#source-source-b) C.[1](#source-source-a)");
        expect(second.footnotes).toEqual([
            { key: "source-a", number: 1, known: true },
            { key: "source-b", number: 2, known: true },
        ]);
    });
});

describe("validateHistoryContent — categories", () => {
    const expectErrorMatching = (contentDir, pattern) => {
        const { errors } = validateHistoryContent({ contentDir, bibleChapters });
        expect(errors.some((error) => pattern.test(error))).toBe(true);
    };

    // A valid in-review fixture category: the Nations and Babel,
    // Gen 10–11, primeval, representative passage Gen 11:1–9.
    function categoryMd({ overview = 400, ancientWorld = 1000, whyItMatters = 200 } = {}) {
        return `## Overview\n\n${"word ".repeat(overview)}\n\n## Ancient World\n\n${"word ".repeat(ancientWorld)}\n\n## Why This Context Matters\n\n${"word ".repeat(whyItMatters)}\n`;
    }

    function addCategory(contentDir, { mutate, md = categoryMd() } = {}) {
        const category = {
            id: "category-nations-and-babel",
            title: "The Nations and Babel",
            category: "category",
            status: "in-review",
            era: "primeval",
            primaryScripture: { book: "Genesis", bookId: "genesis", startChapter: 11, startVerse: 1, endChapter: 11, endVerse: 9 },
            fullRange: { book: "Genesis", bookId: "genesis", startChapter: 10, startVerse: 1, endChapter: 11, endVerse: 32 },
            date: { type: "unknown", label: "No independently established date", yearStart: null, yearEnd: null, note: "Chronology is narrative only." },
            locations: [],
            topics: [],
            relatedEvents: ["event-great-flood"],
            connections: [{ id: "conn-nb-001", book: "Genesis", bookId: "genesis", startChapter: 11, startVerse: 1, endChapter: 11, endVerse: 9, type: "direct-account", confidence: "established", note: "The Babel account." }],
            sources: ["source-skinner-genesis"],
            claims: [{ id: "clm-nb-001", claim: "Gen 10–11 traces the nations from Noah's sons.", evidence: "Textual: the table of nations.", assessment: "established" }],
            review: { author: "Test author", reviewer: "Test reviewer", lastReviewed: "2026-11-17", checklistVersion: "standards-1.1-section-14" },
        };
        if (mutate) mutate(category);
        mkdirSync(path.join(contentDir, "categories"), { recursive: true });
        writeFileSync(path.join(contentDir, "categories", "nations-and-babel.json"), JSON.stringify(category, null, 2));
        writeFileSync(path.join(contentDir, "categories", "nations-and-babel.md"), md);
        mutateJson(contentDir, "books/genesis.json", (book) => {
            // The shipped tree already lists the real published
            // category at narrativeOrder 11; the fixture replaces
            // that entry instead of pushing a second one (a duplicate
            // narrativeOrder fails validation).
            const fixtureEntry = { categoryId: "category-nations-and-babel", kind: "category", narrativeOrder: 11, bookNote: "Genesis 10–11 traces the nations from Noah's sons and tells of Babel. No independently established date is assigned." };
            const existing = book.entries.findIndex((entry) => entry.kind === "category" && entry.categoryId === "category-nations-and-babel");
            if (existing >= 0) book.entries[existing] = fixtureEntry;
            else book.entries.push(fixtureEntry);
        });
        return category;
    }

    it("passes a valid in-review category with claims", () => {
        const { contentDir } = makeTempTree();
        addCategory(contentDir);
        expect(validateHistoryContent({ contentDir, bibleChapters }).errors).toEqual([]);
    });

    it("passes a valid category with no claims key (Creation proves the shape)", () => {
        const { contentDir } = makeTempTree();
        addCategory(contentDir, { mutate: (category) => { delete category.claims; } });
        expect(validateHistoryContent({ contentDir, bibleChapters }).errors).toEqual([]);
    });

    it("rejects a category claim with a missing assessment", () => {
        const { contentDir } = makeTempTree();
        addCategory(contentDir, { mutate: (category) => { delete category.claims[0].assessment; } });
        expectErrorMatching(contentDir, /claims\[0\]: assessment is required/);
    });

    it("rejects a primaryScripture spanning more than 3 chapters", () => {
        const { contentDir } = makeTempTree();
        addCategory(contentDir, { mutate: (category) => {
            category.primaryScripture.startChapter = 10;
            category.primaryScripture.endChapter = 14;
        } });
        expectErrorMatching(contentDir, /primaryScripture spans more than 3 chapters/);
    });

    it("rejects a primaryScripture outside fullRange (chapter level)", () => {
        const { contentDir } = makeTempTree();
        addCategory(contentDir, { mutate: (category) => {
            category.primaryScripture.startChapter = 12;
            category.primaryScripture.startVerse = 1;
            category.primaryScripture.endChapter = 12;
            category.primaryScripture.endVerse = 3;
        } });
        expectErrorMatching(contentDir, /primaryScripture .* lies outside fullRange/);
    });

    it("rejects a primaryScripture outside fullRange (verse level)", () => {
        const { contentDir } = makeTempTree();
        addCategory(contentDir, { mutate: (category) => {
            category.fullRange.startVerse = 5;
            category.primaryScripture.startChapter = 10;
            category.primaryScripture.startVerse = 1;
            category.primaryScripture.endChapter = 10;
            category.primaryScripture.endVerse = 4;
        } });
        expectErrorMatching(contentDir, /primaryScripture .* lies outside fullRange/);
    });

    it("rejects a constituentEvents key", () => {
        const { contentDir } = makeTempTree();
        addCategory(contentDir, { mutate: (category) => {
            category.constituentEvents = ["event-great-flood"];
        } });
        expectErrorMatching(contentDir, /constituentEvents is not part of the standalone category shape/);
    });

    it("rejects a relatedCategories key", () => {
        const { contentDir } = makeTempTree();
        addCategory(contentDir, { mutate: (category) => {
            category.relatedCategories = ["category-creation-and-first-generations"];
        } });
        expectErrorMatching(contentDir, /relatedCategories is not part of the category shape/);
    });

    it("rejects a bad era", () => {
        const { contentDir } = makeTempTree();
        addCategory(contentDir, { mutate: (category) => { category.era = "ancient"; } });
        expectErrorMatching(contentDir, /era "ancient" is not one of primeval, patriarchal/);
    });

    it("rejects category prose outside the option-(ii) caps", () => {
        const { contentDir } = makeTempTree();
        addCategory(contentDir, { md: categoryMd({ overview: 100 }) });
        expectErrorMatching(contentDir, /overview is 100 words \(required 300–600\)/);
    });

    it("rejects a category id/filename mismatch", () => {
        const { contentDir } = makeTempTree();
        addCategory(contentDir, { mutate: (category) => { category.id = "category-wrong-slug"; } });
        expectErrorMatching(contentDir, /filename must be "wrong-slug\.json"/);
    });

    it("rejects a published category citing a not-independently-verified source without an override", () => {
        const { contentDir } = makeTempTree({ eventStatus: "published", markSourcesVerified: false });
        addCategory(contentDir, { mutate: (category) => {
            category.status = "published";
            category.sources = ["source-brown-cosmic-temple"];
        } });
        expectErrorMatching(contentDir, /published category cites not-independently-verified source "source-brown-cosmic-temple" without a review\.editorialOverride/);
    });

    it("passes a published category with an editorial override for its NIV source", () => {
        const { contentDir } = makeTempTree({ eventStatus: "published", markSourcesVerified: false });
        addCategory(contentDir, { mutate: (category) => {
            category.status = "published";
            category.sources = ["source-brown-cosmic-temple"];
            category.review.editorialOverride = true;
        } });
        expect(validateHistoryContent({ contentDir, bibleChapters }).errors).toEqual([]);
    });

    it("rejects relatedEvents pointing at a nonexistent event", () => {
        const { contentDir } = makeTempTree();
        addCategory(contentDir, { mutate: (category) => { category.relatedEvents = ["event-nope"]; } });
        expectErrorMatching(contentDir, /relatedEvents id "event-nope" does not resolve to an event/);
    });

    it("rejects a category not listed in any book", () => {
        const { contentDir } = makeTempTree();
        addCategory(contentDir);
        mutateJson(contentDir, "books/genesis.json", (book) => {
            book.entries = book.entries.filter((entry) => entry.kind !== "category");
        });
        expectErrorMatching(contentDir, /category is not listed in any book/);
    });

    it("finds a non-published category id for the gate check", () => {
        const { contentDir } = makeTempTree();
        addCategory(contentDir);
        const tree = readTreeInventory(contentDir);
        // All ten shipped events are published now, and so are all
        // twenty-seven shipped categories, so the only non-published record
        // is the in-review fixture category (which replaces the
        // shipped, published Nations and Babel).
        expect(findNonPublishedIds({ contentDir })).toEqual(nonPublishedIds(tree));
    });
});

describe("validateHistoryContent — the unified entries array", () => {
    const expectErrorMatching = (contentDir, pattern) => {
        const { errors } = validateHistoryContent({ contentDir, bibleChapters });
        expect(errors.some((error) => pattern.test(error))).toBe(true);
    };

    it("keeps the Genesis book's entries in narrative order with contiguous orders", () => {
        const book = JSON.parse(readFileSync(path.join(repoContentDir, "books", "genesis.json"), "utf8"));
        const tree = readTreeInventory(repoContentDir);
        const genesisBook = bookById(tree, "genesis");
        expect(book).not.toHaveProperty("events");
        // The expected ids/kinds/orders come from the book file itself;
        // the independent check is the contiguity assertion below.
        expect(book.entries.map((entry) => entry.eventId ?? entry.categoryId)).toEqual(
            genesisBook.entries.map((entry) => entry.eventId ?? entry.categoryId),
        );
        expect(book.entries.map((entry) => entry.kind)).toEqual(genesisBook.entries.map((entry) => entry.kind));
        expect(book.entries.map((entry) => entry.narrativeOrder)).toEqual(genesisBook.entries.map((entry) => entry.narrativeOrder));
        // Independent of the helper: narrativeOrder is exactly 1..N
        // contiguous across all books, except for the one reserved gap —
        // order 38 is held for a possible Numbers D9 follow-up, so the
        // published orders run 1..37 then 39..87. Any other gap or a
        // duplicate fails here even though the derived lists above
        // would follow the file.
        const allOrders = tree.books
            .flatMap((b) => b.entries.map((entry) => entry.narrativeOrder))
            .sort((a, b) => a - b);
        const expectedOrders = Array.from({ length: 87 }, (_, i) => i + 1).filter((n) => n !== 38);
        expect(allOrders).toEqual(expectedOrders);
        for (const entry of book.entries) {
            expect(typeof entry.bookNote).toBe("string");
            expect(entry.bookNote.trim()).not.toBe("");
        }
        expect(validateHistoryContent({ contentDir: repoContentDir, bibleChapters }).errors).toEqual([]);
    });

    it("rejects a stale events key in a book file", () => {
        const { contentDir } = makeTempTree();
        mutateJson(contentDir, "books/genesis.json", (book) => {
            book.events = book.entries;
        });
        expectErrorMatching(contentDir, /stale "events" key/);
    });

    it("rejects an entries entry with a bad kind", () => {
        const { contentDir } = makeTempTree();
        mutateJson(contentDir, "books/genesis.json", (book) => {
            book.entries[0].kind = "chapter";
        });
        expectErrorMatching(contentDir, /needs a kind \("event" or "category"\)/);
    });

    it("rejects a duplicate narrativeOrder across kinds", () => {
        const { contentDir } = makeTempTree();
        mutateJson(contentDir, "books/genesis.json", (book) => {
            book.entries.push({ categoryId: "category-nations-and-babel", kind: "category", narrativeOrder: 1, bookNote: "Duplicate order." });
        });
        expectErrorMatching(contentDir, /narrativeOrder 1 is used twice/);
    });

    it("rejects a category entry that does not resolve to a category", () => {
        const { contentDir } = makeTempTree();
        mutateJson(contentDir, "books/genesis.json", (book) => {
            book.entries.push({ categoryId: "category-nope", kind: "category", narrativeOrder: 11, bookNote: "No such category." });
        });
        expectErrorMatching(contentDir, /categoryId "category-nope" does not resolve to a category/);
    });
});

describe("generateHistoryContent — categories", () => {
    function categoryMd({ overview = 400, ancientWorld = 1000, whyItMatters = 200 } = {}) {
        return `## Overview\n\n${"word ".repeat(overview)}\n\n## Ancient World\n\n${"word ".repeat(ancientWorld)}\n\n## Why This Context Matters\n\n${"word ".repeat(whyItMatters)}\n`;
    }

    function addCategory(contentDir, { mutate, md = categoryMd() } = {}) {
        const category = {
            id: "category-nations-and-babel",
            title: "The Nations and Babel",
            category: "category",
            status: "in-review",
            era: "primeval",
            primaryScripture: { book: "Genesis", bookId: "genesis", startChapter: 11, startVerse: 1, endChapter: 11, endVerse: 9 },
            fullRange: { book: "Genesis", bookId: "genesis", startChapter: 10, startVerse: 1, endChapter: 11, endVerse: 32 },
            date: { type: "unknown", label: "No independently established date", yearStart: null, yearEnd: null, note: "Chronology is narrative only." },
            locations: [],
            topics: [],
            relatedEvents: ["event-great-flood"],
            connections: [{ id: "conn-nb-001", book: "Genesis", bookId: "genesis", startChapter: 11, startVerse: 1, endChapter: 11, endVerse: 9, type: "direct-account", confidence: "established", note: "The Babel account." }],
            sources: ["source-skinner-genesis"],
            claims: [{ id: "clm-nb-001", claim: "Gen 10–11 traces the nations from Noah's sons.", evidence: "Textual: the table of nations.", assessment: "established" }],
            review: { author: "Test author", reviewer: "Test reviewer", lastReviewed: "2026-11-17", checklistVersion: "standards-1.1-section-14" },
        };
        if (mutate) mutate(category);
        mkdirSync(path.join(contentDir, "categories"), { recursive: true });
        writeFileSync(path.join(contentDir, "categories", "nations-and-babel.json"), JSON.stringify(category, null, 2));
        writeFileSync(path.join(contentDir, "categories", "nations-and-babel.md"), md);
        mutateJson(contentDir, "books/genesis.json", (book) => {
            // The shipped tree already lists the real published
            // category at narrativeOrder 11; the fixture replaces
            // that entry instead of pushing a second one (a duplicate
            // narrativeOrder fails validation).
            const fixtureEntry = { categoryId: "category-nations-and-babel", kind: "category", narrativeOrder: 11, bookNote: "Genesis 10–11 traces the nations from Noah's sons and tells of Babel. No independently established date is assigned." };
            const existing = book.entries.findIndex((entry) => entry.kind === "category" && entry.categoryId === "category-nations-and-babel");
            if (existing >= 0) book.entries[existing] = fixtureEntry;
            else book.entries.push(fixtureEntry);
        });
        return category;
    }

    it("generates a published fixture category with claims/review stripped", () => {
        const { contentDir, outDir } = makeTempTree({ eventStatus: "published" });
        addCategory(contentDir, { mutate: (category) => { category.status = "published"; } });
        const tree = readTreeInventory(contentDir);
        const { manifest } = generateHistoryContent({
            contentDir, outputDir: outDir, includeUnpublished: false, bibleChapters,
        });
        expect(manifest.categories).toEqual(publishedIds(tree.categories));
        expect(manifest.categories).toEqual(expect.arrayContaining(APPROVED_CATEGORIES));
        expect(manifest.events).toEqual(publishedIds(tree.events));
        expect(existsSync(path.join(outDir, "categories", "nations-and-babel.json"))).toBe(true);
        expect(existsSync(path.join(outDir, "categories", "nations-and-babel.md"))).toBe(true);
        const generated = JSON.parse(readFileSync(path.join(outDir, "categories", "nations-and-babel.json"), "utf8"));
        expect(generated).not.toHaveProperty("claims");
        expect(generated).not.toHaveProperty("review");
        expect(generated.title).toBe("The Nations and Babel");
        expect(generated.era).toBe("primeval");
        expect(generated.connections).toHaveLength(1);
        expect(generated.sources).toEqual(["source-skinner-genesis"]);
        // The generated book keeps the unified entries array, filtered
        // to included records: 10 published events + the four published
        // categories (the fixture replaces the shipped Nations and Babel
        // at narrativeOrder 11).
        const book = JSON.parse(readFileSync(path.join(outDir, "books", "genesis.json"), "utf8"));
        expect(book).not.toHaveProperty("events");
        expect(book.entries).toHaveLength(bookById(tree, "genesis").entries.length);
        expect(book.entries.map((entry) => entry.kind)).toEqual(bookById(tree, "genesis").entries.map((entry) => entry.kind));
        expect(book.entries[10]).toEqual({ categoryId: "category-nations-and-babel", kind: "category", narrativeOrder: 11, bookNote: "Genesis 10–11 traces the nations from Noah's sons and tells of Babel. No independently established date is assigned." });
        // The fixture category cites only Skinner, already cited by
        // published events, so the four sources cited only by the
        // shipped Nations and Babel drop out (156 − 4 = 152).
        expect(manifest.sources).toEqual(citedSourceIds(publishedRecords(tree)));
        expect(manifest.sources).toContain("source-skinner-genesis");
    });

    it("excludes an in-review fixture category from production generation, includes it with the dev opt-in", () => {
        const { contentDir, outDir } = makeTempTree({ eventStatus: "published" });
        addCategory(contentDir);
        const tree = readTreeInventory(contentDir);
        const { manifest } = generateHistoryContent({
            contentDir, outputDir: outDir, includeUnpublished: false, bibleChapters,
        });
        // The fixture replaces the shipped, published Nations and
        // Babel with an in-review one; the other three shipped
        // categories are published, so they still ship.
        expect(manifest.categories).toEqual(publishedIds(tree.categories));
        expect(existsSync(path.join(outDir, "categories", "nations-and-babel.json"))).toBe(false);
        const dev = generateHistoryContent({
            contentDir, outputDir: outDir, includeUnpublished: true, bibleChapters,
        });
        // The dev opt-in includes the in-review fixture category —
        // and the shipped, now-published Building the Tabernacle,
        // Covenant and God's Law, Israel in the Wilderness, Israel's
        // Oppression and Moses' Early Life, Passover and the Exodus,
        // Pharaoh and the Ten Plagues, and Tabernacle and Israel's
        // Rebellion categories as well.
        expect(dev.manifest.categories).toEqual(allIds(tree.categories));
        expect(existsSync(path.join(outDir, "categories", "nations-and-babel.json"))).toBe(true);
        const generated = JSON.parse(readFileSync(path.join(outDir, "categories", "nations-and-babel.json"), "utf8"));
        expect(generated).not.toHaveProperty("claims");
        expect(generated).not.toHaveProperty("review");
    });
});
