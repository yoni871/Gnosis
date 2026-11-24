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

const BH_PATHS = ["/biblical-history", "/biblical-history/1-samuel-birth-and-rise-of-samuel", "/biblical-history/1-samuel-capture-and-return-of-the-ark", "/biblical-history/1-samuel-david-among-the-philistines-ziklag-and-the-muster", "/biblical-history/1-samuel-david-dismissed-and-ziklag-recovered", "/biblical-history/1-samuel-davids-anointing-and-rise", "/biblical-history/1-samuel-israel-demands-a-king", "/biblical-history/1-samuel-saul-becomes-israels-first-king", "/biblical-history/1-samuel-saul-consults-the-medium-at-en-dor", "/biblical-history/1-samuel-sauls-persecution-of-david", "/biblical-history/1-samuel-sauls-rejection-as-king", "/biblical-history/1-samuel-the-battle-of-mount-gilboa-and-sauls-death", "/biblical-history/2-samuel-absaloms-revolt-and-davids-flight", "/biblical-history/2-samuel-ammonite-war-and-the-fall-of-david", "/biblical-history/2-samuel-amnon-tamar-and-absaloms-revenge-and-return", "/biblical-history/2-samuel-death-of-saul-and-civil-war-for-the-throne", "/biblical-history/2-samuel-jerusalem-taken-and-the-ark-brought-up", "/biblical-history/2-samuel-the-battle-in-the-wood-of-ephraim-absaloms-death-and-davids-return", "/biblical-history/2-samuel-the-davidic-covenant-and-the-consolidation-of-the-kingdom", "/biblical-history/2-samuel-the-famine-the-gibeonites-and-the-giants", "/biblical-history/2-samuel-the-song-the-last-words-and-the-census-and-the-plague", "/biblical-history/deuteronomy-blessing-death-moses", "/biblical-history/deuteronomy-blessings-curses-covenant", "/biblical-history/deuteronomy-covenant-greatest-commandment", "/biblical-history/deuteronomy-joshua-song-moses", "/biblical-history/deuteronomy-justice-kingship-leadership", "/biblical-history/deuteronomy-laws-israelite-society", "/biblical-history/deuteronomy-remembering-god-promised-land", "/biblical-history/deuteronomy-renewal-covenant", "/biblical-history/deuteronomy-wilderness-journey", "/biblical-history/deuteronomy-worship-life-land", "/biblical-history/building-the-tabernacle", "/biblical-history/covenant-and-gods-law", "/biblical-history/israel-in-the-wilderness", "/biblical-history/oppression-and-moses-early-life", "/biblical-history/passover-and-the-exodus", "/biblical-history/pharaoh-and-the-ten-plagues", "/biblical-history/tabernacle-and-israels-rebellion", "/biblical-history/abraham-and-sarah", "/biblical-history/adam-and-eve", "/biblical-history/cain-and-abel", "/biblical-history/cains-descendants", "/biblical-history/creation", "/biblical-history/great-flood", "/biblical-history/humanitys-corruption", "/biblical-history/isaac-jacob-and-esau", "/biblical-history/joseph-and-israel-in-egypt", "/biblical-history/nations-and-babel", "/biblical-history/noah-and-his-sons", "/biblical-history/noah-ark", "/biblical-history/noahs-sacrifice-and-covenant", "/biblical-history/seth-early-generations", "/biblical-history/joshua-achan-ai-and-covenant-renewal", "/biblical-history/joshua-cities-of-refuge-and-levitical-cities", "/biblical-history/joshua-commission-and-rahab", "/biblical-history/joshua-crossing-the-jordan", "/biblical-history/joshua-dividing-the-promised-land", "/biblical-history/joshua-eastern-tribes-and-the-altar", "/biblical-history/joshua-fall-of-jericho", "/biblical-history/joshua-farewell-and-covenant-at-shechem", "/biblical-history/joshua-gibeonite-deception", "/biblical-history/joshua-northern-campaign-and-defeated-kings", "/biblical-history/joshua-remaining-tribal-allotments", "/biblical-history/joshua-southern-campaign", "/biblical-history/judges-abimelech-s-violent-rule", "/biblical-history/judges-civil-war-and-the-near-destruction-of-benjamin", "/biblical-history/judges-deborah-barak-and-jael", "/biblical-history/judges-gideon-and-the-midianites", "/biblical-history/judges-israels-disobedience-and-the-cycle-of-judges", "/biblical-history/judges-israels-incomplete-conquest", "/biblical-history/judges-jephthah-and-the-ammonites", "/biblical-history/judges-micah-s-idolatry-and-the-migration-of-dan", "/biblical-history/judges-othniel-ehud-and-shamgar", "/biblical-history/judges-samson-and-the-philistines", "/biblical-history/judges-the-levite-and-the-crime-at-gibeah", "/biblical-history/judges-tola-jair-and-israel-s-renewed-oppression", "/biblical-history/leviticus-day-of-atonement", "/biblical-history/leviticus-festivals-worship", "/biblical-history/leviticus-holiness-code", "/biblical-history/leviticus-jubilee-covenant", "/biblical-history/leviticus-priesthood-consecration", "/biblical-history/leviticus-purity-restoration", "/biblical-history/leviticus-sacrificial-system", "/biblical-history/numbers-balaam-and-moab", "/biblical-history/numbers-departure-and-wilderness-complaints", "/biblical-history/numbers-final-wilderness-journey", "/biblical-history/numbers-holiness-and-preparation", "/biblical-history/numbers-israel-organized-at-sinai", "/biblical-history/numbers-korah-and-priesthood", "/biblical-history/numbers-new-generation-and-joshua", "/biblical-history/numbers-preparing-to-inherit", "/biblical-history/numbers-twelve-spies-and-rebellion", "/biblical-history/ruth-gleans-in-the-field-of-boaz", "/biblical-history/ruth-naomi-and-ruth-return-to-bethlehem", "/biblical-history/ruth-the-generations-of-perez", "/biblical-history/ruth-the-threshing-floor-and-the-gate"];

test("every published legacy History URL has one permanent, loop-free redirect", () => {
    const generatedDir = path.join(process.cwd(), "src", "generated", "history");
    const config = JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));
    const redirects = new Map(config.redirects.map((redirect) => [redirect.source, redirect]));
    expect(redirects.size).toBe(config.redirects.length);
    for (const file of readdirSync(path.join(generatedDir, "books")).filter((name) => name.endsWith(".json"))) {
        const book = JSON.parse(readFileSync(path.join(generatedDir, "books", file), "utf8"));
        const entries = [...book.entries].sort((a, b) => a.narrativeOrder - b.narrativeOrder);
        if (entries.length === 0) continue;
        const firstSlug = (entries[0].eventId ?? entries[0].categoryId).replace(/^(event|category)-/, "");
        expect(redirects.get(`/biblical-history/${book.id}`)).toMatchObject({ destination: `/biblical-history/${firstSlug}`, permanent: true });
        for (const entry of entries) {
            const slug = (entry.eventId ?? entry.categoryId).replace(/^(event|category)-/, "");
            const redirect = redirects.get(`/biblical-history/${book.id}/${slug}`);
            expect(redirect).toMatchObject({ destination: `/biblical-history/${slug}`, permanent: true });
            expect(redirects.has(redirect.destination)).toBe(false);
        }
    }
});

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

    test("rejects a published event and category with the same flat slug", () => {
        expect(() => historySitemapPaths(
            { books: ["genesis"], events: ["event-creation"], categories: ["category-creation"] },
            [{ id: "genesis", entries: [
                { kind: "event", eventId: "event-creation" },
                { kind: "category", categoryId: "category-creation" },
            ] }],
        )).toThrow(/slug collision: creation/);
    });

    test("lists the homepage and a published book's published event and book landing URLs", () => {
        expect(historySitemapPaths(manifest, books)).toEqual([
            "/biblical-history",
            "/biblical-history/creation",
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
            "/biblical-history/creation",
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
            "/biblical-history/creation",
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
            "/biblical-history/creation",
            "/biblical-history/psalm-23",
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
            "/biblical-history/creation",
            "/biblical-history/patriarchs",
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
            "/biblical-history/creation",
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
            "/biblical-history/creation",
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
            "/biblical-history/alpha",
            "/biblical-history/zebra",
        ]);
    });

    test("emits nothing extra when manifest.categories is empty", () => {
        expect(historySitemapPaths({ ...manifest, categories: [] }, books)).toEqual([
            "/biblical-history",
            "/biblical-history/creation",
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
