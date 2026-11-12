// Content-pipeline tests: validation (fail closed) and published-only
// generation (the publication gate). Fixtures are copies of the real
// shipped content tree, mutated per case, so the shipped Creation content
// is itself under test.
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
        const { manifest } = generateHistoryContent({
            contentDir, outputDir: outDir, includeUnpublished: false, bibleChapters,
        });
        expect(manifest.events).toEqual(["event-creation"]);
        expect(manifest.books).toEqual(["genesis"]);
        expect(existsSync(path.join(outDir, "events", "creation.json"))).toBe(true);
        expect(existsSync(path.join(outDir, "events", "creation.md"))).toBe(true);
    });
    it("excludes a draft event from production generation", () => {
        const { contentDir, outDir } = makeTempTree({ eventStatus: "draft" });
        const { manifest } = generateHistoryContent({
            contentDir, outputDir: outDir, includeUnpublished: false, bibleChapters,
        });
        expect(manifest.events).toEqual([]);
        expect(manifest.books).toEqual([]);
        expect(existsSync(path.join(outDir, "events", "creation.json"))).toBe(false);
    });
    it("includes the draft only with the local-dev opt-in", () => {
        const { contentDir, outDir } = makeTempTree({ eventStatus: "draft" });
        const { manifest } = generateHistoryContent({
            contentDir, outputDir: outDir, includeUnpublished: true, bibleChapters,
        });
        expect(manifest.events).toEqual(["event-creation"]);
        expect(manifest.includeUnpublished).toBe(true);
    });
    it("finds non-published ids for the gate check", () => {
        const { contentDir } = makeTempTree({ eventStatus: "draft" });
        expect(findNonPublishedIds({ contentDir })).toEqual([
            { id: "event-creation", kind: "event", status: "draft" },
        ]);
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
            book.events = [];
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
