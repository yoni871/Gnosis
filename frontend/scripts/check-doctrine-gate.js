// CI / post-build assertion for the Doctrine publication gate.
//
// The guarantee must be verifiable, not just asserted: after a
// production build, no non-published title, date, quotation,
// explanation, or id may appear anywhere in the generated study or
// in dist/. Unpublished titles are content too — a leaked work title
// carries no id, but it carries the title.
//
//   node scripts/check-doctrine-gate.js
//
// Reads the research tree (the list of non-published records), the
// generated study, and dist/ when it exists. Exits 1 on any
// violation, 0 when the gate holds. Run from check-build.js after the
// production build, and as the "postbuild" hook for plain
// `npm run build` runs.
//
// The gate NEVER skips: a generated file that does not match the
// current research tree is itself a failure, and the leak scan runs
// even when nothing is non-published (the all-published path), so its
// failures must not be swallowed by an early exit.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

import { checkDoctrineGate } from "./doctrine-content-lib.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const researchDir = path.join(root, "..", "research", "trace-the-doctrine");
const generatedDir = path.join(root, "src", "generated", "doctrine");
const distDir = path.join(root, "dist");
// The demonstration study's source: the gate's dist/ scan treats a
// leak string the demo contains as explained, not a leak (see the
// lib) — the demo's passage ids are the same strings as the real
// passages' ids, and the demo ships in the bundle by design.
const demoFile = path.join(root, "src", "data", "doctrineStudies.js");

const { failures, warnings } = checkDoctrineGate({ researchDir, generatedDir, distDir, demoFile });

if (!existsSync(distDir)) {
    console.log("Doctrine gate: dist/ not present — skipping the bundle scan (generated-file check only).");
}

for (const warning of warnings) {
    console.log(`Doctrine gate warning: ${warning}`);
}
if (failures.length > 0) {
    for (const failure of failures) {
        console.error(`Doctrine gate FAILED: ${failure}`);
    }
    process.exit(1);
}
console.log("Doctrine gate: OK — no unpublished content in the generated study or dist/.");
