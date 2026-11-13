// Vite plugin: the History publication gate, enforced inside the build.
//
// `vite build` skips npm's prebuild/postbuild hooks, so a direct build —
// or a stale src/generated/history/ left over from a dev-flag run —
// could otherwise bundle unpublished records. This plugin, applied to
// builds only (`apply: "build"` — never the dev server), regenerates
// published-only content at build start (overwriting any stale generated
// directory) and runs the gate checks when the bundle closes, failing the
// build on any violation.
//
// Paths resolve relative to this file (frontend/scripts/), so the plugin
// works wherever the frontend tree is copied. It reads no environment
// variable: every build it runs is published-only.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { checkHistoryGate, generateHistoryContent } from "./history-content-lib.js";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptsDir, "..");
const contentDir = path.join(root, "src", "content", "history");
const outputDir = path.join(root, "src", "generated", "history");
const bibleChapters = JSON.parse(
    readFileSync(path.join(root, "src", "data", "bibleChapters.json"), "utf8"),
);

export function historyGatePlugin() {
    let outDir = path.join(root, "dist");
    return {
        name: "gnosis-history-gate",
        apply: "build",
        configResolved(config) {
            // Honor the build's configured output directory.
            outDir = path.isAbsolute(config.build.outDir)
                ? config.build.outDir
                : path.join(config.root, config.build.outDir);
        },
        buildStart() {
            // Regenerate published-only content first, so a stale generated
            // directory (e.g. from a dev-flag run) can never leak into the
            // bundle. Throws on any validation error — the build fails
            // closed, never ships broken content.
            generateHistoryContent({
                contentDir,
                outputDir,
                includeUnpublished: false,
                bibleChapters,
            });
        },
        closeBundle() {
            // No early return on "nothing non-published": the claims
            // detector inside checkHistoryGate runs on the all-published
            // path too, and its failures must fail the build.
            const { failures } = checkHistoryGate({
                contentDir,
                generatedDir: outputDir,
                distDir: outDir,
            });
            if (failures.length > 0) {
                throw new Error(`History gate FAILED:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
            }
        },
    };
}
