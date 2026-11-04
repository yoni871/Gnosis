// Regenerates frontend/public/sitemap.xml from the verified chapter
// manifest (frontend/src/data/bibleChapters.json).
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
// Runs on every deploy through the "prebuild" script, and the generated
// file is also committed so the sitemap is reviewable in the PR and
// present in builds that do not run npm hooks (e.g. build:check).
//
// Usage: node scripts/generate-sitemap.js
//   SITE_URL (or VITE_SITE_URL) overrides the default production origin.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

import { buildSitemapXml } from "../src/utils/sitemap.js";

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

// "/" is the public landing page, so it is listed after the chapters.
const xml = buildSitemapXml(siteUrl, chapterCounts, ["/"]);
const outputPath = path.join(root, "public/sitemap.xml");

writeFileSync(outputPath, xml);

const total = Object.values(chapterCounts).reduce((sum, n) => sum + n, 0);
console.log(
    `Wrote ${outputPath} (${Object.keys(chapterCounts).length} books, ` +
        `${total} chapter URLs, plus the homepage) for ${siteUrl}`,
);
