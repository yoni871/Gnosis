// CI / post-build assertion for the History publication gate (plan §3.7).
//
// The guarantee must be verifiable, not just asserted: after a production
// build, no non-published event or topic id may appear anywhere in the
// generated manifest or in dist/. Unpublished titles are content too — an
// id appearing in a bundle chunk would mean its record shipped.
//
//   node scripts/check-history-gate.js
//
// Reads the source content tree (the list of non-published ids), the
// generated manifest, and dist/ when it exists. Exits 1 on any violation,
// 0 when the gate holds. Run from check-build.js after the production
// build, and as the "postbuild" hook for plain `npm run build` runs.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

import { findNonPublishedIds } from "./history-content-lib.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const contentDir = path.join(root, "src", "content", "history");
const generatedDir = path.join(root, "src", "generated", "history");
const distDir = path.join(root, "dist");

const failures = [];
const nonPublished = findNonPublishedIds({ contentDir });

if (nonPublished.length === 0) {
    console.log("History gate: no non-published records exist; nothing to leak.");
    process.exit(0);
}

// 1. The generated manifest must list only published ids — unless this
// was an explicit local dev-flag build, which is not a production build
// and is allowed to include unpublished records for preview.
const manifestPath = path.join(generatedDir, "manifest.json");
if (!existsSync(manifestPath)) {
    failures.push("generated manifest is missing — run the History content build first.");
} else {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.includeUnpublished === true) {
        console.log(
            "History gate: skipped — manifest was generated with " +
            "HISTORY_INCLUDE_UNPUBLISHED=1 (local dev preview, not a production build).",
        );
        process.exit(0);
    }
    const listed = [...(manifest.events ?? []), ...(manifest.topics ?? [])];
    for (const { id, status } of nonPublished) {
        if (listed.includes(id)) {
            failures.push(`manifest lists non-published id "${id}" (status ${status}).`);
        }
    }
}

// 2. No non-published id may appear in any built asset.
function* textFiles(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* textFiles(full);
        else if (/\.(js|css|html|json|txt|map)$/.test(entry.name)) yield full;
    }
}
if (existsSync(distDir)) {
    for (const file of textFiles(distDir)) {
        const text = readFileSync(file, "utf8");
        for (const { id, status } of nonPublished) {
            if (text.includes(id)) {
                failures.push(`dist/${path.relative(distDir, file)} contains non-published id "${id}" (status ${status}).`);
            }
        }
    }
} else {
    console.log("History gate: dist/ not present — skipping the bundle scan (manifest check only).");
}

if (failures.length > 0) {
    console.error(`History gate FAILED:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
    process.exit(1);
}
console.log(
    `History gate passed: ${nonPublished.length} non-published record(s) ` +
        `(${nonPublished.map((r) => r.id).join(", ")}) appear in neither the manifest nor dist/.`,
);
