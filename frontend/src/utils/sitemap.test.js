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
// this reflects the shipped published state (Creation published).
function publishedHistoryPaths() {
    const generatedDir = path.join(process.cwd(), "src", "generated", "history");
    const manifest = JSON.parse(readFileSync(path.join(generatedDir, "manifest.json"), "utf8"));
    const books = readdirSync(path.join(generatedDir, "books"))
        .filter((file) => file.endsWith(".json"))
        .map((file) => JSON.parse(readFileSync(path.join(generatedDir, "books", file), "utf8")));
    return historySitemapPaths(manifest, books);
}

const BH_PATHS = ["/biblical-history", "/biblical-history/genesis", "/biblical-history/genesis/creation"];

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
    const manifest = { books: ["genesis"], events: ["event-creation"], sources: [], topics: [] };
    const books = [{ id: "genesis", events: [{ eventId: "event-creation", narrativeOrder: 1 }] }];

    test("lists the index, a published book page, and its published event URL", () => {
        expect(historySitemapPaths(manifest, books)).toEqual([
            "/biblical-history",
            "/biblical-history/genesis",
            "/biblical-history/genesis/creation",
        ]);
    });

    test("omits a book with no published content and an event in no generated book", () => {
        const otherBooks = [
            { id: "genesis", events: [{ eventId: "event-creation", narrativeOrder: 1 }] },
            { id: "exodus", events: [{ eventId: "event-exodus", narrativeOrder: 1 }] },
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
                events: [
                    { eventId: "event-creation", narrativeOrder: 1 },
                    { eventId: "event-flood", narrativeOrder: 2 },
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
        expect(historySitemapPaths({ books: [], events: [], sources: [], topics: [] }, [])).toEqual([]);
        expect(historySitemapPaths(null, null)).toEqual([]);
    });

    test("orders multiple books and their events deterministically", () => {
        const multi = {
            books: ["psalms", "genesis"],
            events: ["event-creation", "event-psalm-23"],
            sources: [],
            topics: [],
        };
        const multiBooks = [
            { id: "psalms", events: [{ eventId: "event-psalm-23", narrativeOrder: 1 }] },
            { id: "genesis", events: [{ eventId: "event-creation", narrativeOrder: 1 }] },
        ];
        expect(historySitemapPaths(multi, multiBooks)).toEqual([
            "/biblical-history",
            "/biblical-history/genesis",
            "/biblical-history/genesis/creation",
            "/biblical-history/psalms",
            "/biblical-history/psalms/psalm-23",
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
    test("contains exactly the 1,189 canonical chapter URLs plus the homepage, About page, Privacy page, and the 3 published Biblical History URLs, nothing else", () => {
        const historyPaths = publishedHistoryPaths();
        expect(historyPaths).toEqual(BH_PATHS);
        const xml = buildSitemapXml(SITE_URL, chapterCounts, ["/", "/about", "/privacy", ...historyPaths]);
        const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(
            ([, url]) => url,
        );

        expect(urls).toHaveLength(1195);
        expect(new Set(urls).size).toBe(1195);
        expect(urls[0]).toBe("https://studygnosis.com/bible/Genesis/1");
        expect(urls[urls.length - 7]).toBe(
            "https://studygnosis.com/bible/Revelation/22",
        );
        expect(urls[urls.length - 6]).toBe("https://studygnosis.com/");
        expect(urls[urls.length - 5]).toBe("https://studygnosis.com/about");
        expect(urls[urls.length - 4]).toBe("https://studygnosis.com/privacy");
        expect(urls[urls.length - 3]).toBe("https://studygnosis.com/biblical-history");
        expect(urls[urls.length - 2]).toBe("https://studygnosis.com/biblical-history/genesis");
        expect(urls[urls.length - 1]).toBe("https://studygnosis.com/biblical-history/genesis/creation");
        expect(urls.filter(url => url === "https://studygnosis.com/about")).toHaveLength(1);
        expect(urls.filter(url => url === "https://studygnosis.com/privacy")).toHaveLength(1);
        expect(urls).toContain("https://studygnosis.com/bible/1%20Samuel/1");
        expect(urls).toContain("https://studygnosis.com/bible/Psalms/150");
        expect(urls.some((url) => url.includes(" "))).toBe(false);
        expect(urls.some((url) => url.includes("?"))).toBe(false);
        expect(
            urls.some(
                (url) =>
                    url.includes("/login") ||
                    url.includes("/register") ||
                    url.includes("/search"),
            ),
        ).toBe(false);
        // Only the published Biblical History pages appear: no other
        // book (the other 65 are Upcoming) and no unpublished event.
        const bhUrls = urls.filter((url) => url.includes("/biblical-history"));
        expect(bhUrls).toHaveLength(3);
        expect(urls.some((url) => url.includes("/biblical-history/exodus"))).toBe(false);
    });

    test("the committed public/sitemap.xml matches the generator output", () => {
        // Vitest rewrites import.meta.url, so locate the file from the
        // working directory instead: tests always run from frontend/.
        const committed = readFileSync(
            path.join(process.cwd(), "public/sitemap.xml"),
            "utf8",
        );
        expect(committed).toBe(
            buildSitemapXml(SITE_URL, chapterCounts, ["/", "/about", "/privacy", ...publishedHistoryPaths()]),
        );
    });
});
