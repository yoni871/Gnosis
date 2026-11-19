import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { describe, expect, test } from "vitest";

import { buildSitemapXml, chapterUrls, historySitemapPaths } from "./sitemap";
import chapterCounts from "../data/bibleChapters.json";

const SITE_URL = "https://studygnosis.com";

// Biblical History paths for the production sitemap, derived from the
// real generated manifest — the same source the generator script reads.
// `npm test` regenerates the manifest first (see the "test" script), so
// this reflects the shipped published state (all ten Genesis events,
// all four Genesis categories, and all seven Exodus categories published).
function publishedHistoryPaths() {
    const generatedDir = path.join(process.cwd(), "src", "generated", "history");
    const manifest = JSON.parse(readFileSync(path.join(generatedDir, "manifest.json"), "utf8"));
    const books = readdirSync(path.join(generatedDir, "books"))
        .filter((file) => file.endsWith(".json"))
        .map((file) => JSON.parse(readFileSync(path.join(generatedDir, "books", file), "utf8")));
    return historySitemapPaths(manifest, books);
}

const BH_PATHS = ["/biblical-history", "/biblical-history/exodus", "/biblical-history/exodus/building-the-tabernacle", "/biblical-history/exodus/covenant-and-gods-law", "/biblical-history/exodus/israel-in-the-wilderness", "/biblical-history/exodus/oppression-and-moses-early-life", "/biblical-history/exodus/passover-and-the-exodus", "/biblical-history/exodus/pharaoh-and-the-ten-plagues", "/biblical-history/exodus/tabernacle-and-israels-rebellion", "/biblical-history/genesis", "/biblical-history/genesis/abraham-and-sarah", "/biblical-history/genesis/adam-and-eve", "/biblical-history/genesis/cain-and-abel", "/biblical-history/genesis/cains-descendants", "/biblical-history/genesis/creation", "/biblical-history/genesis/great-flood", "/biblical-history/genesis/humanitys-corruption", "/biblical-history/genesis/isaac-jacob-and-esau", "/biblical-history/genesis/joseph-and-israel-in-egypt", "/biblical-history/genesis/nations-and-babel", "/biblical-history/genesis/noah-and-his-sons", "/biblical-history/genesis/noah-ark", "/biblical-history/genesis/noahs-sacrifice-and-covenant", "/biblical-history/genesis/seth-early-generations", "/biblical-history/leviticus", "/biblical-history/leviticus/leviticus-day-of-atonement", "/biblical-history/leviticus/leviticus-festivals-worship", "/biblical-history/leviticus/leviticus-holiness-code", "/biblical-history/leviticus/leviticus-jubilee-covenant", "/biblical-history/leviticus/leviticus-priesthood-consecration", "/biblical-history/leviticus/leviticus-purity-restoration", "/biblical-history/leviticus/leviticus-sacrificial-system"];

describe("chapterUrls", () => {
    test("lists every chapter in book order, ascending", () => {
        const urls = chapterUrls(SITE_URL, { Genesis: 2, Exodus: 1 });
        expect(urls).toEqual([
            "https://studygnosis.com/bible/Genesis/1",
            "https://studygnosis.com/bible/Genesis/2",
            "https://studygnosis.com/bible/Exodus/1",
        ]);
    });

    test("percent-encodes book names with spaces", () => {
        expect(chapterUrls(SITE_URL, { "1 Samuel": 1 })).toEqual([
            "https://studygnosis.com/bible/1%20Samuel/1",
        ]);
    });
});

describe("buildSitemapXml", () => {
    test("emits valid sitemap XML with only the given URLs", () => {
        const xml = buildSitemapXml(SITE_URL, { Jude: 1 }, []);
        expect(xml).toContain(
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        );
        expect(xml).toContain(
            "<loc>https://studygnosis.com/bible/Jude/1</loc>",
        );
        expect(xml).not.toContain("lastmod");
        expect(xml).not.toContain("changefreq");
        expect(xml).not.toContain("priority");
    });

    test("appends extra static public paths after the chapters", () => {
        const xml = buildSitemapXml(SITE_URL, { Jude: 1 }, ["/"]);
        expect(xml.indexOf("/bible/Jude/1")).toBeLessThan(
            xml.indexOf("<loc>https://studygnosis.com/</loc>"),
        );
    });
});

describe("historySitemapPaths", () => {
    const manifest = { books: ["genesis"], events: ["event-creation"], categories: [], sources: [], topics: [] };
    const books = [{ id: "genesis", entries: [{ kind: "event", eventId: "event-creation", narrativeOrder: 1 }] }];

    test("lists the homepage and a published book's published event and book landing URLs", () => {
        expect(historySitemapPaths(manifest, books)).toEqual([
            "/biblical-history",
            "/biblical-history/genesis",
            "/biblical-history/genesis/creation",
        ]);
    });

    test("omits a book with no published content and an event in no generated book", () => {
        const otherBooks = [
            { id: "genesis", entries: [{ kind: "event", eventId: "event-creation", narrativeOrder: 1 }] },
            { id: "exodus", entries: [{ kind: "event", eventId: "event-exodus", narrativeOrder: 1 }] },
        ];
        // Exodus is not in the published manifest, and event-exodus is
        // not in it either — neither gets a URL, even though a book
        // record for it exists.
        expect(historySitemapPaths(manifest, otherBooks)).toEqual([
            "/biblical-history",
            "/biblical-history/genesis",
            "/biblical-history/genesis/creation",
        ]);
    });

    test("omits an event id that is not in the published manifest", () => {
        const booksWithDraft = [
            {
                id: "genesis",
                entries: [
                    { kind: "event", eventId: "event-creation", narrativeOrder: 1 },
                    { kind: "event", eventId: "event-flood", narrativeOrder: 2 },
                ],
            },
        ];
        // event-flood is listed in the book record but is not a
        // published event in the manifest — it must not get a URL.
        expect(historySitemapPaths(manifest, booksWithDraft)).toEqual([
            "/biblical-history",
            "/biblical-history/genesis",
            "/biblical-history/genesis/creation",
        ]);
    });

    test("returns no Biblical History paths when nothing is published", () => {
        expect(historySitemapPaths({ books: [], events: [], categories: [], sources: [], topics: [] }, [])).toEqual([]);
        expect(historySitemapPaths(null, null)).toEqual([]);
    });

    test("orders multiple books and their events deterministically", () => {
        const multi = {
            books: ["psalms", "genesis"],
            events: ["event-creation", "event-psalm-23"],
            categories: [],
            sources: [],
            topics: [],
        };
        const multiBooks = [
            { id: "psalms", entries: [{ kind: "event", eventId: "event-psalm-23", narrativeOrder: 1 }] },
            { id: "genesis", entries: [{ kind: "event", eventId: "event-creation", narrativeOrder: 1 }] },
        ];
        expect(historySitemapPaths(multi, multiBooks)).toEqual([
            "/biblical-history",
            "/biblical-history/genesis",
            "/biblical-history/genesis/creation",
            "/biblical-history/psalms",
            "/biblical-history/psalms/psalm-23",
        ]);
    });

    test("lists a published category URL for a published fixture category", () => {
        const withCategory = {
            books: ["genesis"],
            events: ["event-creation"],
            categories: ["category-patriarchs"],
            sources: [],
            topics: [],
        };
        const booksWithCategory = [
            {
                id: "genesis",
                entries: [
                    { kind: "event", eventId: "event-creation", narrativeOrder: 1 },
                    { kind: "category", categoryId: "category-patriarchs", narrativeOrder: 2 },
                ],
            },
        ];
        expect(historySitemapPaths(withCategory, booksWithCategory)).toEqual([
            "/biblical-history",
            "/biblical-history/genesis",
            "/biblical-history/genesis/creation",
            "/biblical-history/genesis/patriarchs",
        ]);
    });

    test("omits a category id that is not in the published manifest", () => {
        const withDraftCategory = {
            books: ["genesis"],
            events: ["event-creation"],
            categories: [],
            sources: [],
            topics: [],
        };
        const booksWithDraftCategory = [
            {
                id: "genesis",
                entries: [
                    { kind: "event", eventId: "event-creation", narrativeOrder: 1 },
                    { kind: "category", categoryId: "category-patriarchs", narrativeOrder: 2 },
                ],
            },
        ];
        // category-patriarchs is listed in the book record but is not
        // a published category in the manifest — it must not get a URL.
        expect(historySitemapPaths(withDraftCategory, booksWithDraftCategory)).toEqual([
            "/biblical-history",
            "/biblical-history/genesis",
            "/biblical-history/genesis/creation",
        ]);
    });

    test("omits a category listed in the manifest but in no generated book", () => {
        const orphanCategory = {
            books: ["genesis"],
            events: ["event-creation"],
            categories: ["category-patriarchs"],
            sources: [],
            topics: [],
        };
        // The manifest lists the category, but no generated book
        // carries an entry for it — no URL.
        expect(historySitemapPaths(orphanCategory, books)).toEqual([
            "/biblical-history",
            "/biblical-history/genesis",
            "/biblical-history/genesis/creation",
        ]);
    });

    test("sorts mixed event and category slugs deterministically within a book", () => {
        const mixed = {
            books: ["genesis"],
            events: ["event-zebra"],
            categories: ["category-alpha"],
            sources: [],
            topics: [],
        };
        const mixedBooks = [
            {
                id: "genesis",
                entries: [
                    { kind: "event", eventId: "event-zebra", narrativeOrder: 1 },
                    { kind: "category", categoryId: "category-alpha", narrativeOrder: 2 },
                ],
            },
        ];
        // Alphabetical by slug, events and categories interleaved — not
        // grouped by kind.
        expect(historySitemapPaths(mixed, mixedBooks)).toEqual([
            "/biblical-history",
            "/biblical-history/genesis",
            "/biblical-history/genesis/alpha",
            "/biblical-history/genesis/zebra",
        ]);
    });

    test("emits nothing extra when manifest.categories is empty", () => {
        expect(historySitemapPaths({ ...manifest, categories: [] }, books)).toEqual([
            "/biblical-history",
            "/biblical-history/genesis",
            "/biblical-history/genesis/creation",
        ]);
    });
});

describe("verified chapter manifest", () => {
    test("covers all 66 books and 1,189 chapters", () => {
        const total = Object.values(chapterCounts).reduce(
            (sum, count) => sum + count,
            0,
        );
        expect(Object.keys(chapterCounts)).toHaveLength(66);
        expect(total).toBe(1189);
    });

    test("every chapter count is a positive integer", () => {
        for (const [book, count] of Object.entries(chapterCounts)) {
            expect(
                Number.isInteger(count) && count >= 1,
                `${book} has an invalid chapter count`,
            ).toBe(true);
        }
    });
});

describe("production sitemap output", () => {
    test("contains only canonical chapter, public, and published History URLs", () => {
        const historyPaths = publishedHistoryPaths();
        expect(historyPaths).toEqual(BH_PATHS);
        const xml = buildSitemapXml(SITE_URL, chapterCounts, ["/", "/about", "/privacy", "/trace-the-doctrine", ...historyPaths]);
        const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(([, url]) => url);
        expect(urls).toHaveLength(1189 + 4 + BH_PATHS.length);
        expect(new Set(urls).size).toBe(urls.length);
        expect(urls[0]).toBe("https://studygnosis.com/bible/Genesis/1");
        expect(urls[1188]).toBe("https://studygnosis.com/bible/Revelation/22");
        expect(urls.slice(1189)).toEqual(["/", "/about", "/privacy", "/trace-the-doctrine", ...BH_PATHS].map(path => `${SITE_URL}${path}`));
        expect(urls).not.toContain(`${SITE_URL}/biblical-history/books`);
        expect(urls.some(url => url.includes("/biblical-history/1-samuel"))).toBe(false);
    });

    test("the committed public/sitemap.xml matches the generator output", () => {
        // Vitest rewrites import.meta.url, so locate the file from the
        // working directory instead: tests always run from frontend/.
        const committed = readFileSync(
            path.join(process.cwd(), "public/sitemap.xml"),
            "utf8",
        );
        expect(committed).toBe(
            buildSitemapXml(SITE_URL, chapterCounts, ["/", "/about", "/privacy", "/trace-the-doctrine", ...publishedHistoryPaths()]),
        );
    });
});
