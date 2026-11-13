// CI / post-build assertion for the History publication gate (plan §3.7).
//
// The guarantee must be verifiable, not just asserted: after a production
// build, no non-published event, topic, or source record — id, title, or
// source entry — may appear anywhere in the generated manifest or in
// dist/. Unpublished titles are content too — a leaked Markdown file
// carries no id, but it carries its title.
//
//   node scripts/check-history-gate.js
//
// Reads the source content tree (the list of non-published records), the
// generated manifest, and dist/ when it exists. Exits 1 on any violation,
// 0 when the gate holds. Run from check-build.js after the production
// build, and as the "postbuild" hook for plain `npm run build` runs.
//
// The gate NEVER skips: a manifest generated with unpublished content is
// itself a failure. A dev-flag build is not a production build, and this
// script's job is to prove the production artifact is clean.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

import { checkHistoryGate } from "./history-content-lib.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const contentDir = path.join(root, "src", "content", "history");
const generatedDir = path.join(root, "src", "generated", "history");
const distDir = path.join(root, "dist");

const { failures, nonPublished } = checkHistoryGate({ contentDir, generatedDir, distDir });

if (!existsSync(distDir)) {
    console.log("History gate: dist/ not present — skipping the bundle scan (manifest check only).");
}

// Failures first: the claims detector runs even when nothing is
// non-published (the all-published path), so its failures must not be
// swallowed by the "nothing to leak" exit below.
if (failures.length > 0) {
    console.error(`History gate FAILED:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
    process.exit(1);
}

if (nonPublished.length === 0) {
    console.log("History gate: no non-published records exist; nothing to leak.");
    process.exit(0);
}

console.log(
    `History gate passed: ${nonPublished.length} non-published record(s) ` +
        `(${nonPublished.map((r) => r.id).join(", ")}) appear in neither the manifest nor dist/.`,
);
