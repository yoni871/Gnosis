// Regenerates frontend/public/sitemap.xml from the verified chapter
// manifest (frontend/src/data/bibleChapters.json) plus Biblical History
// pages with published content.
//
// The manifest is the source of truth for which chapter URLs exist. It
// was verified against backend/src/bsb.xlsx -- the same file the
// production Bible import reads -- using the importer's own parsing
// rules (skip the first 3 header rows, "Book Chapter:Verse" references,
// "Psalm" mapped to "Psalms"): 66 books, 1,189 chapters, 31,102 verses,
// no gaps, exact match with backend/src/data/bible_books.json. If Bible
// data ever changes, recount from the import source and update the
// manifest; this script then picks the new pages up automatically.
//
// Biblical History URLs (index and published event URLs — never
// book-page URLs, which redirect to the book's first published event)
// come from the PUBLISHED-ONLY generated manifest
// (frontend/src/generated/history/manifest.json) and the generated book
// records — never from the source tree, so an unpublished event cannot
// appear by construction. This REVERSES the earlier standing decision
// ("no event URLs in the sitemap yet"): Biblical History URLs are now
// included deliberately, with unpublished content excluded by the
// published-only manifest. The manifest must be generated first — the
// "prebuild" script runs build-history-content.js before this script,
// and this script fails closed if the manifest is missing.
//
// Runs on every deploy through the "prebuild" script, and the generated
// file is also committed so the sitemap is reviewable in the PR and
// present in builds that do not run npm hooks (e.g. build:check).
//
// Usage: node scripts/generate-sitemap.js
//   SITE_URL (or VITE_SITE_URL) overrides the default production origin.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

import { buildSitemapXml, historySitemapPaths } from "../src/utils/sitemap.js";

// import.meta.url is frontend/scripts/generate-sitemap.js, so "../"
// resolves to the frontend directory itself -- no dirname() on top.
const root = fileURLToPath(new URL("../", import.meta.url));

const siteUrl = (
    process.env.SITE_URL ||
    process.env.VITE_SITE_URL ||
    "https://studygnosis.com"
).replace(/\/+$/, "");

const chapterCounts = JSON.parse(
    readFileSync(path.join(root, "src/data/bibleChapters.json"), "utf8"),
);

// Biblical History pages come from the published-only generated
// manifest (see above): fail closed if it has not been generated yet.
const generatedDir = path.join(root, "src", "generated", "history");
const manifestPath = path.join(generatedDir, "manifest.json");
if (!existsSync(manifestPath)) {
    console.error(
        "History manifest is missing — run `node scripts/build-history-content.js` first. " +
            "The sitemap reads published Biblical History pages from the generated manifest, " +
            "so the manifest must be generated before the sitemap.",
    );
    process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const generatedBooks = [];
const booksDir = path.join(generatedDir, "books");
if (existsSync(booksDir)) {
    for (const file of readdirSync(booksDir)) {
        if (file.endsWith(".json")) {
            generatedBooks.push(JSON.parse(readFileSync(path.join(booksDir, file), "utf8")));
        }
    }
}
const historyPaths = historySitemapPaths(manifest, generatedBooks);

// The public landing, About, and Privacy pages follow the chapter URLs,
// then the Biblical History pages.
const xml = buildSitemapXml(siteUrl, chapterCounts, ["/", "/about", "/privacy", ...historyPaths]);
const outputPath = path.join(root, "public/sitemap.xml");

writeFileSync(outputPath, xml);

const total = Object.values(chapterCounts).reduce((sum, n) => sum + n, 0);
console.log(
    `Wrote ${outputPath} (${Object.keys(chapterCounts).length} books, ` +
        `${total} chapter URLs, plus the homepage, About page, and Privacy page` +
        (historyPaths.length > 0 ? `, plus ${historyPaths.length} Biblical History page(s)` : ", no published Biblical History pages") +
        `) for ${siteUrl}`,
);
