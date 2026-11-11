// Build-time History content pipeline (plan §3.7).
//
// Validates every file under frontend/src/content/history/ and generates
// the published-only content the app loader reads, into the gitignored
// frontend/src/generated/history/ directory.
//
//   node scripts/build-history-content.js
//
// Runs via the "prebuild" and "predev" hooks, so every build and every
// local dev start regenerates it. Fails the build (exit 1) on any
// validation error — a broken record blocks the build, never ships.
//
// Local draft preview is an explicit opt-in only:
//
//   HISTORY_INCLUDE_UNPUBLISHED=1 node scripts/build-history-content.js
//
// That flag must NEVER be set in CI or production builds: with it, draft /
// in-review / verified records are generated too, so an author can preview
// a draft locally. The script prints a warning banner when it is on.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

import { generateHistoryContent } from "./history-content-lib.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const contentDir = path.join(root, "src", "content", "history");
const outputDir = path.join(root, "src", "generated", "history");
const bibleChapters = JSON.parse(
    readFileSync(path.join(root, "src", "data", "bibleChapters.json"), "utf8"),
);

const includeUnpublished = process.env.HISTORY_INCLUDE_UNPUBLISHED === "1";

if (includeUnpublished) {
    console.warn(
        "WARNING: HISTORY_INCLUDE_UNPUBLISHED=1 — generating unpublished History content. " +
            "Local development only; never set this in CI or production builds.",
    );
}

try {
    const { manifest, warnings } = generateHistoryContent({
        contentDir,
        outputDir,
        includeUnpublished,
        bibleChapters,
    });
    for (const warning of warnings) console.warn(`History content warning: ${warning}`);
    console.log(
        `History content: generated ${manifest.events.length} event(s), ` +
            `${manifest.topics.length} topic(s), ${manifest.books.length} book(s), ` +
            `${manifest.sources.length} source(s)` +
            (includeUnpublished ? " (including unpublished)" : " (published only)") +
            ` into ${outputDir}`,
    );
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
