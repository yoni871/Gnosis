// Build-time History content pipeline (plan §3.7).
//
// Validates every file under frontend/src/content/history/ and generates
// the published-only content the app loader reads, into the gitignored
// frontend/src/generated/history/ directory.
//
//   node scripts/build-history-content.js
//
// Runs via the "prebuild" hook and from check-build.js, so every build
// regenerates it. Fails the build (exit 1) on any validation error — a
// broken record blocks the build, never ships.
//
// Production builds are ALWAYS published-only. This script never reads
// HISTORY_INCLUDE_UNPUBLISHED from the environment: the only way to
// include unpublished records is the explicit CLI flag
//
//   node scripts/build-history-content.js --include-unpublished
//
// which only the dev-only wrapper (build-history-content-dev.js, run by
// the "predev" hook) passes. A stray flag in CI, on a build machine, or
// in a developer's shell therefore has no effect on any build — the
// script warns about it and builds published-only. The script prints a
// warning banner when the flag is on.

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

const includeUnpublished = process.argv.includes("--include-unpublished");

// A stray HISTORY_INCLUDE_UNPUBLISHED in the environment has no effect
// on any build (see above) — warn about it, unless the explicit flag
// was also passed (the dev wrapper translates the variable into the flag,
// so there is nothing to warn about on that path).
if (!includeUnpublished && process.env.HISTORY_INCLUDE_UNPUBLISHED !== undefined) {
    console.warn(
        "WARNING: HISTORY_INCLUDE_UNPUBLISHED is set in the environment but is ignored by builds — " +
            "unpublished History content is available only via `npm run dev` (predev). " +
            "Building published-only content.",
    );
}

if (includeUnpublished) {
    console.warn(
        "WARNING: --include-unpublished — generating unpublished History content. " +
            "Local development only; never use this flag for a production build.",
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
