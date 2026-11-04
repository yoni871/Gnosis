import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { describe, expect, test } from "vitest";

import { buildSitemapXml, chapterUrls } from "./sitemap";
import chapterCounts from "../data/bibleChapters.json";

const SITE_URL = "https://studygnosis.com";

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
    test("contains exactly the 1,189 canonical chapter URLs plus the homepage, nothing else", () => {
        const xml = buildSitemapXml(SITE_URL, chapterCounts, ["/"]);
        const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(
            ([, url]) => url,
        );

        expect(urls).toHaveLength(1190);
        expect(new Set(urls).size).toBe(1190);
        expect(urls[0]).toBe("https://studygnosis.com/bible/Genesis/1");
        expect(urls[urls.length - 2]).toBe(
            "https://studygnosis.com/bible/Revelation/22",
        );
        expect(urls[urls.length - 1]).toBe("https://studygnosis.com/");
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
    });

    test("the committed public/sitemap.xml matches the generator output", () => {
        // Vitest rewrites import.meta.url, so locate the file from the
        // working directory instead: tests always run from frontend/.
        const committed = readFileSync(
            path.join(process.cwd(), "public/sitemap.xml"),
            "utf8",
        );
        expect(committed).toBe(
            buildSitemapXml(SITE_URL, chapterCounts, ["/"]),
        );
    });
});
