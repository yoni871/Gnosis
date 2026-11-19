// TEMPORARY migration check for the A1 conversion (proposal §3.1).
// Verifies the tree-derived values from historyTestHelpers.js match the
// hardcoded expected lists in historyContent.test.js /
// historyGate.test.js / historyService.test.js on the Exodus-complete
// main (1eb1835) BEFORE those lists are deleted. Deleted in the same PR
// once this passes — it is not part of the converted suite.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import bibleChapters from "../data/bibleChapters.json";
import { generateHistoryContent } from "../../scripts/history-content-lib";
import {
    allIds,
    allRecords,
    bookById,
    citedSourceIds,
    nonPublishedRecords,
    publishedIds,
    publishedRecords,
    readTreeInventory,
} from "./historyTestHelpers";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoContentDir = path.resolve(here, "../content/history");
const tempDirs = [];
afterEach(() => {
    while (tempDirs.length > 0) rmSync(tempDirs.pop(), { recursive: true, force: true });
});

function makeTempTree({ eventStatus = "published" } = {}) {
    const dir = mkdtempSync(path.join(tmpdir(), "history-migration-"));
    tempDirs.push(dir);
    const contentDir = path.join(dir, "content");
    cpSync(repoContentDir, contentDir, { recursive: true });
    const eventPath = path.join(contentDir, "events", "creation.json");
    const event = JSON.parse(readFileSync(eventPath, "utf8"));
    event.status = eventStatus;
    writeFileSync(eventPath, JSON.stringify(event, null, 2));
    return { contentDir, outDir: path.join(dir, "generated") };
}

// The current hardcoded lists, copied verbatim from the test files.
const HARDCODED_EVENTS_10 = ["event-adam-and-eve", "event-cain-and-abel", "event-cains-descendants", "event-creation", "event-great-flood", "event-humanitys-corruption", "event-noah-and-his-sons", "event-noah-ark", "event-noahs-sacrifice-and-covenant", "event-seth-early-generations"];
const HARDCODED_EVENTS_9 = ["event-adam-and-eve", "event-cain-and-abel", "event-cains-descendants", "event-great-flood", "event-humanitys-corruption", "event-noah-and-his-sons", "event-noah-ark", "event-noahs-sacrifice-and-covenant", "event-seth-early-generations"];
const HARDCODED_CATEGORIES_11 = ["category-abraham-and-sarah", "category-building-the-tabernacle", "category-covenant-and-gods-law", "category-isaac-jacob-and-esau", "category-israel-in-the-wilderness", "category-joseph-and-israel-in-egypt", "category-nations-and-babel", "category-oppression-and-moses-early-life", "category-passover-and-the-exodus", "category-pharaoh-and-the-ten-plagues", "category-tabernacle-and-israels-rebellion"];
const HARDCODED_BOOKS_2 = ["exodus", "genesis"];
const HARDCODED_GENESIS_ENTRIES = ["event-creation", "event-adam-and-eve", "event-cain-and-abel", "event-cains-descendants", "event-seth-early-generations", "event-humanitys-corruption", "event-noah-ark", "event-great-flood", "event-noahs-sacrifice-and-covenant", "event-noah-and-his-sons", "category-nations-and-babel", "category-abraham-and-sarah", "category-isaac-jacob-and-esau", "category-joseph-and-israel-in-egypt"];
const HARDCODED_EXODUS_ENTRIES = ["category-oppression-and-moses-early-life", "category-pharaoh-and-the-ten-plagues", "category-passover-and-the-exodus", "category-israel-in-the-wilderness", "category-covenant-and-gods-law", "category-tabernacle-and-israels-rebellion", "category-building-the-tabernacle"];

describe("A1 migration — derived values match the hardcoded lists on main 1eb1835", () => {
    it("production mode: 10 events, 11 categories, 2 books, 142 cited sources", () => {
        const { contentDir, outDir } = makeTempTree({ eventStatus: "published" });
        const tree = readTreeInventory(contentDir);
        expect(publishedIds(tree.events)).toEqual(HARDCODED_EVENTS_10);
        expect(publishedIds(tree.categories)).toEqual(HARDCODED_CATEGORIES_11);
        expect(publishedIds(tree.books)).toEqual(HARDCODED_BOOKS_2);
        expect(citedSourceIds(publishedRecords(tree))).toHaveLength(142);
        // And the derived cited set is exactly what the generator ships.
        const { manifest } = generateHistoryContent({
            contentDir, outputDir: outDir, includeUnpublished: false, bibleChapters,
        });
        expect(manifest.sources).toEqual(citedSourceIds(publishedRecords(tree)));
        expect(manifest.events).toEqual(publishedIds(tree.events));
        expect(manifest.categories).toEqual(publishedIds(tree.categories));
        expect(manifest.books).toEqual(publishedIds(tree.books));
    });

    it("flag sandbox (Creation in-review): 9 events, 11 categories, 2 books, 139 cited sources", () => {
        const { contentDir, outDir } = makeTempTree({ eventStatus: "in-review" });
        const tree = readTreeInventory(contentDir);
        expect(publishedIds(tree.events)).toEqual(HARDCODED_EVENTS_9);
        expect(publishedIds(tree.categories)).toEqual(HARDCODED_CATEGORIES_11);
        expect(publishedIds(tree.books)).toEqual(HARDCODED_BOOKS_2);
        expect(citedSourceIds(publishedRecords(tree))).toHaveLength(139);
        const { manifest } = generateHistoryContent({
            contentDir, outputDir: outDir, includeUnpublished: false, bibleChapters,
        });
        expect(manifest.sources).toEqual(citedSourceIds(publishedRecords(tree)));
        // The flag sandbox's non-published records: Creation + its three
        // unpublished-only sources, in the lib's scan order.
        expect(nonPublishedRecords(tree)).toEqual([
            { id: "event-creation", kind: "event", status: "in-review", title: "Creation" },
            {
                id: "source-brown-cosmic-temple",
                kind: "source",
                status: "unpublished-only",
                title: "The Cosmic Temple: Cosmogony According to Genesis 1:1–2:3",
            },
            {
                id: "source-crouch-image-of-god",
                kind: "source",
                status: "unpublished-only",
                title: "Made in the Image of God: The Creation of אדם, the Commissioning of the King and the Chaoskampf of YHWH",
            },
            {
                id: "source-british-museum-shabaka",
                kind: "source",
                status: "unpublished-only",
                title: "Shabaka Stone transcript and Hieroglyphs exhibition guide (EA498)",
            },
        ]);
    });

    it("dev opt-in (Creation draft): 10 events, 11 categories, 142 cited sources", () => {
        const { contentDir, outDir } = makeTempTree({ eventStatus: "draft" });
        const tree = readTreeInventory(contentDir);
        expect(allIds(tree.events)).toEqual(HARDCODED_EVENTS_10);
        expect(allIds(tree.categories)).toEqual(HARDCODED_CATEGORIES_11);
        expect(citedSourceIds(allRecords(tree))).toHaveLength(142);
        const { manifest } = generateHistoryContent({
            contentDir, outputDir: outDir, includeUnpublished: true, bibleChapters,
        });
        expect(manifest.sources).toEqual(citedSourceIds(allRecords(tree)));
        expect(manifest.events).toEqual(allIds(tree.events));
        expect(manifest.categories).toEqual(allIds(tree.categories));
    });

    it("book entries match the book files, and narrativeOrder is 1..21 contiguous across books", () => {
        const tree = readTreeInventory(repoContentDir);
        const genesis = bookById(tree, "genesis");
        const exodus = bookById(tree, "exodus");
        expect(genesis.entries.map((entry) => entry.eventId ?? entry.categoryId)).toEqual(HARDCODED_GENESIS_ENTRIES);
        expect(genesis.entries.map((entry) => entry.kind)).toEqual([...Array(10).fill("event"), "category", "category", "category", "category"]);
        expect(genesis.entries.map((entry) => entry.narrativeOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
        expect(exodus.entries.map((entry) => entry.eventId ?? entry.categoryId)).toEqual(HARDCODED_EXODUS_ENTRIES);
        expect(exodus.entries.map((entry) => entry.kind)).toEqual(["category", "category", "category", "category", "category", "category", "category"]);
        expect(exodus.entries.map((entry) => entry.narrativeOrder)).toEqual([15, 16, 17, 18, 19, 20, 21]);
        const allOrders = tree.books
            .flatMap((book) => book.entries.map((entry) => entry.narrativeOrder))
            .sort((a, b) => a - b);
        expect(allOrders).toEqual(allOrders.map((_, i) => i + 1));
    });
});
