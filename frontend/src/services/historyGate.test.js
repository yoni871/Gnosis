// Publication-gate hardening tests: the CLI scripts, the postbuild gate,
// and the Vite plugin, run as real subprocesses in temp sandboxes so the
// real generated directory is never touched. Sandboxes mirror the
// frontend layout the scripts resolve against (scripts/ + src/content/
// history + src/data/bibleChapters.json + src/utils/historyContent.js).
// Fixtures are copies of the real shipped content tree, so the shipped
// Creation development content (status "draft") is itself under test.
import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { findNonPublishedRecords } from "../../scripts/history-content-lib";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(here, "../..");
const repoContentDir = path.resolve(frontendDir, "src", "content", "history");
const viteBin = path.join(frontendDir, "node_modules", "vite", "bin", "vite.js");
const tempDirs = [];
afterEach(() => {
    while (tempDirs.length > 0) rmSync(tempDirs.pop(), { recursive: true, force: true });
});

function makeSandbox() {
    const dir = mkdtempSync(path.join(tmpdir(), "history-gate-"));
    tempDirs.push(dir);
    // The scripts are ESM; the sandbox needs its own type: module marker
    // (it lives under /tmp, outside the frontend package).
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
    cpSync(path.join(frontendDir, "scripts"), path.join(dir, "scripts"), { recursive: true });
    cpSync(repoContentDir, path.join(dir, "src", "content", "history"), { recursive: true });
    cpSync(path.join(frontendDir, "src", "data"), path.join(dir, "src", "data"), { recursive: true });
    mkdirSync(path.join(dir, "src", "utils"), { recursive: true });
    cpSync(
        path.join(frontendDir, "src", "utils", "historyContent.js"),
        path.join(dir, "src", "utils", "historyContent.js"),
    );
    return dir;
}

// Run a node script in the sandbox. The child environment never inherits
// HISTORY_INCLUDE_UNPUBLISHED unless the case explicitly passes it, so
// tests stay hermetic even if the outer shell exports the flag.
function runNode(script, { env = {}, args = [], cwd }) {
    const childEnv = { ...process.env };
    delete childEnv.HISTORY_INCLUDE_UNPUBLISHED;
    Object.assign(childEnv, env);
    return spawnSync(process.execPath, [script, ...args], { cwd, env: childEnv, encoding: "utf8" });
}

function readManifest(sandbox) {
    return JSON.parse(
        readFileSync(path.join(sandbox, "src", "generated", "history", "manifest.json"), "utf8"),
    );
}

function runGate(sandbox) {
    return runNode("scripts/check-history-gate.js", { cwd: sandbox });
}

function writeDistFile(sandbox, relativePath, content) {
    const file = path.join(sandbox, "dist", relativePath);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
}

function distText(sandbox) {
    const out = [];
    const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else out.push(readFileSync(full, "utf8"));
        }
    };
    walk(path.join(sandbox, "dist"));
    return out.join("\n");
}

describe("build-history-content.js — the flag cannot leak into a build", () => {
    it.each(["1", "true", "yes", undefined])(
        "HISTORY_INCLUDE_UNPUBLISHED=%s generates published-only content",
        (flag) => {
            const sandbox = makeSandbox();
            const env = flag === undefined ? {} : { HISTORY_INCLUDE_UNPUBLISHED: flag };
            const result = runNode("scripts/build-history-content.js", { env, cwd: sandbox });
            expect(result.status).toBe(0);
            const manifest = readManifest(sandbox);
            expect(manifest.includeUnpublished).toBe(false);
            expect(manifest.events).toEqual([]);
            expect(manifest.books).toEqual([]);
            expect(manifest.sources).toEqual([]);
            expect(existsSync(path.join(sandbox, "src", "generated", "history", "events", "creation.json"))).toBe(false);
            expect(existsSync(path.join(sandbox, "src", "generated", "history", "events", "creation.md"))).toBe(false);
        },
    );

    it("--include-unpublished still generates the draft (the dev opt-in)", () => {
        const sandbox = makeSandbox();
        const result = runNode("scripts/build-history-content.js", {
            args: ["--include-unpublished"],
            cwd: sandbox,
        });
        expect(result.status).toBe(0);
        const manifest = readManifest(sandbox);
        expect(manifest.includeUnpublished).toBe(true);
        expect(manifest.events).toEqual(["event-creation"]);
        expect(existsSync(path.join(sandbox, "src", "generated", "history", "events", "creation.json"))).toBe(true);
    });

    it("a production generation overwrites a stale draft generated directory", () => {
        const sandbox = makeSandbox();
        // Stale output from a dev-flag run.
        runNode("scripts/build-history-content.js", {
            args: ["--include-unpublished"],
            cwd: sandbox,
        });
        expect(existsSync(path.join(sandbox, "src", "generated", "history", "events", "creation.json"))).toBe(true);
        // A production generation — with the flag present in the
        // environment, to prove it is ignored — must remove the drafts.
        const result = runNode("scripts/build-history-content.js", {
            env: { HISTORY_INCLUDE_UNPUBLISHED: "1" },
            cwd: sandbox,
        });
        expect(result.status).toBe(0);
        expect(readManifest(sandbox).events).toEqual([]);
        expect(existsSync(path.join(sandbox, "src", "generated", "history", "events", "creation.json"))).toBe(false);
        expect(existsSync(path.join(sandbox, "src", "generated", "history", "events", "creation.md"))).toBe(false);
    });
});

describe("build-history-content-dev.js — the dev-only flag reader", () => {
    it("includes drafts only when HISTORY_INCLUDE_UNPUBLISHED is '1'", () => {
        const sandbox = makeSandbox();
        const result = runNode("scripts/build-history-content-dev.js", {
            env: { HISTORY_INCLUDE_UNPUBLISHED: "1" },
            cwd: sandbox,
        });
        expect(result.status).toBe(0);
        expect(readManifest(sandbox).events).toEqual(["event-creation"]);
        expect(readManifest(sandbox).includeUnpublished).toBe(true);
    });

    it("builds published-only without the flag", () => {
        const sandbox = makeSandbox();
        const result = runNode("scripts/build-history-content-dev.js", { cwd: sandbox });
        expect(result.status).toBe(0);
        expect(readManifest(sandbox).events).toEqual([]);
        expect(readManifest(sandbox).includeUnpublished).toBe(false);
    });
});

describe("check-history-gate.js — never skips, checks ids, titles, sources", () => {
    it("fails a manifest generated with unpublished content (no skip)", () => {
        const sandbox = makeSandbox();
        runNode("scripts/build-history-content.js", {
            args: ["--include-unpublished"],
            cwd: sandbox,
        });
        const result = runGate(sandbox);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/includeUnpublished is true/);
        expect(result.stderr).toMatch(/event-creation/);
    });

    it("fails a manifest with includeUnpublished true even when no ids leak", () => {
        const sandbox = makeSandbox();
        runNode("scripts/build-history-content.js", { cwd: sandbox });
        const manifestPath = path.join(sandbox, "src", "generated", "history", "manifest.json");
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        manifest.includeUnpublished = true;
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        const result = runGate(sandbox);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/includeUnpublished is true/);
    });

    it("fails when dist/ contains a non-published id", () => {
        const sandbox = makeSandbox();
        runNode("scripts/build-history-content.js", { cwd: sandbox });
        writeDistFile(sandbox, "assets/app.js", 'const id = "event-creation";');
        const result = runGate(sandbox);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/event-creation/);
    });

    it("fails when dist/ contains a non-published title but no id", () => {
        const sandbox = makeSandbox();
        runNode("scripts/build-history-content.js", { cwd: sandbox });
        writeDistFile(sandbox, "assets/app.js", 'const heading = "Creation in the ancient Near East";');
        const result = runGate(sandbox);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/title "Creation"/);
    });

    it("fails when dist/ contains a non-published source id", () => {
        const sandbox = makeSandbox();
        runNode("scripts/build-history-content.js", { cwd: sandbox });
        writeDistFile(sandbox, "assets/app.js", 'const key = "source-dev-placeholder";');
        const result = runGate(sandbox);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/source-dev-placeholder/);
    });

    it("fails when dist/ contains a non-published source title but no id", () => {
        const sandbox = makeSandbox();
        // Give the placeholder source a title that shares nothing with
        // the event title, so only the source-title check can fire.
        const registryPath = path.join(sandbox, "src", "content", "history", "sources", "references.json");
        const registry = JSON.parse(readFileSync(registryPath, "utf8"));
        registry["source-dev-placeholder"].title = "Zebra Quokka Field Notes";
        writeFileSync(registryPath, JSON.stringify(registry, null, 2));
        runNode("scripts/build-history-content.js", { cwd: sandbox });
        writeDistFile(sandbox, "assets/app.js", 'const title = "Zebra Quokka Field Notes";');
        const result = runGate(sandbox);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/Zebra Quokka Field Notes/);
    });

    it("passes a clean published-only build", () => {
        const sandbox = makeSandbox();
        runNode("scripts/build-history-content.js", { cwd: sandbox });
        writeDistFile(sandbox, "assets/app.js", 'console.log("Gnosis");');
        const result = runGate(sandbox);
        expect(result.status).toBe(0);
        expect(result.stdout).toMatch(/History gate passed/);
    });

    it("passes the manifest check when dist/ is absent", () => {
        const sandbox = makeSandbox();
        runNode("scripts/build-history-content.js", { cwd: sandbox });
        const result = runGate(sandbox);
        expect(result.status).toBe(0);
        expect(result.stdout).toMatch(/dist\/ not present/);
    });
});

describe("findNonPublishedRecords — titles and draft-only sources", () => {
    it("returns the draft event with its title and its draft-only source", () => {
        const sandbox = makeSandbox();
        const contentDir = path.join(sandbox, "src", "content", "history");
        expect(findNonPublishedRecords({ contentDir })).toEqual([
            { id: "event-creation", kind: "event", status: "draft", title: "Creation" },
            {
                id: "source-dev-placeholder",
                kind: "source",
                status: "unpublished-only",
                title: "Placeholder source for the Creation development event",
            },
        ]);
    });
});

describe("historyGatePlugin — the direct vite build path", () => {
    function makeViteSandbox() {
        const sandbox = makeSandbox();
        // Stale output from a dev-flag run.
        runNode("scripts/build-history-content.js", {
            args: ["--include-unpublished"],
            cwd: sandbox,
        });
        writeFileSync(
            path.join(sandbox, "vite.config.js"),
            'import { historyGatePlugin } from "./scripts/history-gate-plugin.js";\n' +
                "\n" +
                "export default { plugins: [historyGatePlugin()] };\n",
        );
        writeFileSync(
            path.join(sandbox, "index.html"),
            '<!doctype html><html><head><meta charset="utf-8"></head>' +
                '<body><script type="module" src="/src/main.js"></script></body></html>',
        );
        writeFileSync(
            path.join(sandbox, "src", "main.js"),
            'import manifest from "./generated/history/manifest.json";\n' +
                "console.log(manifest.events.length);\n",
        );
        return sandbox;
    }

    it("direct vite build with a stale draft generated directory ships no drafts", () => {
        const sandbox = makeViteSandbox();
        expect(existsSync(path.join(sandbox, "src", "generated", "history", "events", "creation.json"))).toBe(true);
        // Run the vite binary with the sandbox as the working directory
        // (vite takes the project root from cwd); the flag is set in the
        // environment to prove the direct build ignores it.
        const result = spawnSync(process.execPath, [viteBin, "build"], {
            cwd: sandbox,
            env: { ...process.env, HISTORY_INCLUDE_UNPUBLISHED: "1" },
            encoding: "utf8",
        });
        expect(result.status).toBe(0);
        expect(readManifest(sandbox).events).toEqual([]);
        const text = distText(sandbox);
        expect(text).not.toContain("event-creation");
        expect(text).not.toContain("Creation");
        expect(text).not.toContain("source-dev-placeholder");
        expect(text).not.toContain("Placeholder source for the Creation development event");
        // The postbuild gate passes on the result as well.
        expect(runGate(sandbox).status).toBe(0);
    });

    it("plugin is build-only and its closeBundle fails a violating dist", async () => {
        // Read-only import of the shipped plugin: importing it has no
        // side effects beyond reading bibleChapters.json.
        const { historyGatePlugin } = await import("../../scripts/history-gate-plugin.js");
        expect(historyGatePlugin().apply).toBe("build");

        // End-to-end: a real vite build whose bundle is made to leak a
        // non-published id must fail in the gate plugin's closeBundle.
        const sandbox = makeViteSandbox();
        writeFileSync(
            path.join(sandbox, "vite.config.js"),
            'import { historyGatePlugin } from "./scripts/history-gate-plugin.js";\n' +
                "\n" +
                "const leakPlugin = {\n" +
                '    name: "test-leak",\n' +
                "    generateBundle() {\n" +
                '        this.emitFile({ type: "asset", fileName: "leaked.txt", source: \'const id = "event-creation";\' });\n' +
                "    },\n" +
                "};\n" +
                "\n" +
                "export default { plugins: [historyGatePlugin(), leakPlugin] };\n",
        );
        const result = spawnSync(process.execPath, [viteBin, "build"], {
            cwd: sandbox,
            env: { ...process.env },
            encoding: "utf8",
        });
        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(/History gate FAILED/);
        expect(result.stderr).toMatch(/event-creation/);
    });
});
