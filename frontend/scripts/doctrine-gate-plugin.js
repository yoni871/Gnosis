// Vite plugin: the Doctrine publication gate, enforced inside the build.
//
// `vite build` skips npm's prebuild/postbuild hooks, so a direct build —
// or a stale src/generated/doctrine/ left over from an older tree —
// could otherwise bundle a study that no longer matches the research.
// This plugin, applied to builds only (`apply: "build"` — never the
// dev server), regenerates published-only content at build start
// (overwriting any stale generated directory) and runs the gate checks
// when the bundle closes, failing the build on any violation.
//
// Paths resolve relative to this file (frontend/scripts/), so the
// plugin works wherever the frontend tree is copied. It reads no
// environment variable: every build it runs is published-only.

import { fileURLToPath } from "node:url";
import path from "node:path";

import { checkDoctrineGate, generateDoctrineContent } from "./doctrine-content-lib.js";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptsDir, "..");
const researchDir = path.join(root, "..", "research", "trace-the-doctrine");
const outputDir = path.join(root, "src", "generated", "doctrine");
// The demonstration study's source — see check-doctrine-gate.js:
// the gate's dist/ scan treats a leak string the demo contains as
// explained, not a leak.
const demoFile = path.join(root, "src", "data", "doctrineStudies.js");

export function doctrineGatePlugin() {
    let outDir = path.join(root, "dist");
    return {
        name: "gnosis-doctrine-gate",
        apply: "build",
        configResolved(config) {
            // Honor the build's configured output directory.
            outDir = path.isAbsolute(config.build.outDir)
                ? config.build.outDir
                : path.join(config.root, config.build.outDir);
        },
        buildStart() {
            // Regenerate published-only content first, so a stale
            // generated directory can never leak into the bundle.
            // Throws on any validation error — the build fails closed,
            // never ships broken content.
            generateDoctrineContent({ researchDir, outputDir, doctrine: "trinity" });
        },
        closeBundle() {
            // No early return on "nothing non-published": the leak scan
            // inside checkDoctrineGate runs on the all-published path
            // too, and its failures must fail the build.
            const { failures } = checkDoctrineGate({
                researchDir,
                generatedDir: outputDir,
                distDir: outDir,
                demoFile,
            });
            if (failures.length > 0) {
                throw new Error(`Doctrine gate FAILED:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
            }
        },
    };
}
