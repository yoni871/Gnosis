// Build-time Doctrine content pipeline (Trace the Doctrine, Trinity).
//
// Validates the research tree and generates the published-only study
// the Trinity page renders, into the gitignored
// frontend/src/generated/doctrine/ directory.
//
//   node scripts/build-doctrine-content.js
//
// Runs via the "prebuild"/"predev" hooks, from check-build.js, and
// from the Vite doctrine-gate plugin, so every build regenerates it.
// Fails the build (exit 1) on any validation error — a broken record
// blocks the build, never ships.
//
// Production builds are ALWAYS published-only. There is no
// --include-unpublished flag for doctrine content: the only way a
// record reaches the generated file is the adapter's §10 gate
// (status editorially-approved/published, every cited verification
// record verified with editorial approval). With nothing publishable
// — the state of the research today — the file is still written, with
// empty published arrays, and the page keeps rendering the
// demonstration study.

import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

import { generateDoctrineContent } from "./doctrine-content-lib.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const researchDir = path.join(root, "..", "research", "trace-the-doctrine");
const outputDir = path.join(root, "src", "generated", "doctrine");

const result = generateDoctrineContent({ researchDir, outputDir, doctrine: "trinity" });
console.log(
    `Doctrine content: ${result.publishedPassages} published passage(s), ` +
        `${result.publishedInterpretations} published interpretation(s), ` +
        `${result.publishedWorks} work(s), ${result.publishedFigures} figure(s) for ${result.doctrine}.`,
);
if (result.excluded.length > 0) {
    console.log(`Doctrine content: ${result.excluded.length} record(s) withheld by the publication gate.`);
}
for (const entry of result.issues) {
    console.log(`Doctrine content ${entry.severity}: [${entry.kind} ${entry.id ?? "?"}] ${entry.message}`);
}
process.exit(0);
