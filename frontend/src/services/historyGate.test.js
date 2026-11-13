// Publication-gate hardening tests: the CLI scripts, the postbuild gate,
// and the Vite plugin, run as real subprocesses in temp sandboxes so the
// real generated directory is never touched. Sandboxes mirror the
// frontend layout the scripts resolve against (scripts/ + src/content/
// history + src/data/bibleChapters.json + src/utils/historyContent.js).
// Fixtures are copies of the real shipped content tree, with the copied
// Creation event flipped back to "in-review" (see makeSandbox): the
// shipped event is now published, so without that flip the sandbox would
// contain no non-published record at all and every "fails when..." test
// would pass vacuously. The flip restores a genuinely non-published
// fixture — check 10 applies only to published events, and
// findNonPublishedRecords lists by status — so the gate is still tested
// against a real draft leak, not a weakened expectation.
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
    // The shipped Creation event is published, so the sandbox copy is
    // flipped back to "in-review": the gate tests need a genuinely
    // non-published record in the fixture, or the gate's early return
    // ("no non-published records exist") would make every leak test
    // pass without exercising the leak checks at all. This is the only
    // mutation the sandbox makes to the shipped tree.
    const sandboxEventPath = path.join(dir, "src", "content", "history", "events", "creation.json");
    const sandboxEvent = JSON.parse(readFileSync(sandboxEventPath, "utf8"));
    sandboxEvent.status = "in-review";
    writeFileSync(sandboxEventPath, JSON.stringify(sandboxEvent, null, 2));
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
            // The sandbox flips Creation to in-review; the shipped Adam
            // and Eve event is published, so published-only generation
            // still ships it — with the 16 sources it cites — and
            // nothing unpublished.
            expect(manifest.events).toEqual(["event-adam-and-eve"]);
            expect(manifest.books).toEqual(["genesis"]);
            expect(manifest.sources).toEqual([
                "source-balogh-tree-of-life",
                "source-bdb-lexicon",
                "source-benthall-two-trees",
                "source-etcsl-enki-ninmah",
                "source-isaw-sacred-tree",
                "source-jvl-paradise",
                "source-keil-delitzsch-genesis",
                "source-kramer-dilmun",
                "source-mcdowell-human-identity",
                "source-met-mesopotamian-creation",
                "source-oracc-marduk",
                "source-ryle-genesis",
                "source-scriptorium-lamassu",
                "source-skinner-genesis",
                "source-stordalen-eden-narrative",
                "source-westermann-genesis",
            ]);
            expect(existsSync(path.join(sandbox, "src", "generated", "history", "events", "adam-and-eve.json"))).toBe(true);
            expect(existsSync(path.join(sandbox, "src", "generated", "history", "events", "creation.json"))).toBe(false);
            expect(existsSync(path.join(sandbox, "src", "generated", "history", "events", "creation.md"))).toBe(false);
        },
    );

    it("--include-unpublished still generates the unpublished event (the dev opt-in)", () => {
        const sandbox = makeSandbox();
        const result = runNode("scripts/build-history-content.js", {
            args: ["--include-unpublished"],
            cwd: sandbox,
        });
        expect(result.status).toBe(0);
        const manifest = readManifest(sandbox);
        expect(manifest.includeUnpublished).toBe(true);
        // The sandbox flips Creation to in-review; the shipped Adam and
        // Eve event is in-review, so the dev opt-in includes both.
        expect(manifest.events).toEqual(["event-adam-and-eve", "event-creation"]);
        expect(existsSync(path.join(sandbox, "src", "generated", "history", "events", "creation.json"))).toBe(true);
        expect(existsSync(path.join(sandbox, "src", "generated", "history", "events", "adam-and-eve.json"))).toBe(true);
    });

    it("dev-opt-in generation strips the claims register from the generated event JSON", () => {
        const sandbox = makeSandbox();
        const result = runNode("scripts/build-history-content.js", {
            args: ["--include-unpublished"],
            cwd: sandbox,
        });
        expect(result.status).toBe(0);
        const generatedPath = path.join(sandbox, "src", "generated", "history", "events", "adam-and-eve.json");
        const generatedText = readFileSync(generatedPath, "utf8");
        const generated = JSON.parse(generatedText);
        expect(generated).not.toHaveProperty("claims");
        expect(generated).not.toHaveProperty("review");
        expect(generated.title).toBe("Adam and Eve");
        expect(generatedText).not.toContain("clm-ae-028");
        expect(generatedText).not.toContain("clm-ae-030b");
        expect(generatedText).not.toContain("The serpent is Satan.");
        expect(generatedText).not.toContain("reward for obedience");
        // ... while the sandbox SOURCE still carries the full register.
        const source = JSON.parse(readFileSync(
            path.join(sandbox, "src", "content", "history", "events", "adam-and-eve.json"), "utf8",
        ));
        expect(source.claims).toHaveLength(35);
        expect(source.claims.map((claim) => claim.id)).toContain("clm-ae-028");
        expect(source.claims.map((claim) => claim.id)).toContain("clm-ae-030b");
    });

    it("a production generation overwrites a stale unpublished generated directory", () => {
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
        // Only the published Adam and Eve event survives the
        // production generation; the stale Creation drafts are gone.
        expect(readManifest(sandbox).events).toEqual(["event-adam-and-eve"]);
        expect(existsSync(path.join(sandbox, "src", "generated", "history", "events", "adam-and-eve.json"))).toBe(true);
        expect(existsSync(path.join(sandbox, "src", "generated", "history", "events", "creation.json"))).toBe(false);
        expect(existsSync(path.join(sandbox, "src", "generated", "history", "events", "creation.md"))).toBe(false);
    });
});

describe("build-history-content-dev.js — the dev-only flag reader", () => {
    it("includes unpublished content only when HISTORY_INCLUDE_UNPUBLISHED is '1'", () => {
        const sandbox = makeSandbox();
        const result = runNode("scripts/build-history-content-dev.js", {
            env: { HISTORY_INCLUDE_UNPUBLISHED: "1" },
            cwd: sandbox,
        });
        expect(result.status).toBe(0);
        // The sandbox flips Creation to in-review; the shipped Adam and
        // Eve event is in-review, so the dev opt-in includes both.
        expect(readManifest(sandbox).events).toEqual(["event-adam-and-eve", "event-creation"]);
        expect(readManifest(sandbox).includeUnpublished).toBe(true);
    });

    it("builds published-only without the flag", () => {
        const sandbox = makeSandbox();
        const result = runNode("scripts/build-history-content-dev.js", { cwd: sandbox });
        expect(result.status).toBe(0);
        // Published-only: the published Adam and Eve event ships; the
        // in-review Creation fixture does not.
        expect(readManifest(sandbox).events).toEqual(["event-adam-and-eve"]);
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
        writeDistFile(sandbox, "assets/app.js", 'const key = "source-brown-cosmic-temple";');
        const result = runGate(sandbox);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/source-brown-cosmic-temple/);
    });

    it("fails when dist/ contains a non-published source title but no id", () => {
        const sandbox = makeSandbox();
        // Give a real source a title that shares nothing with
        // the event title, so only the source-title check can fire.
        const registryPath = path.join(sandbox, "src", "content", "history", "sources", "references.json");
        const registry = JSON.parse(readFileSync(registryPath, "utf8"));
        registry["source-brown-cosmic-temple"].title = "Zebra Quokka Field Notes";
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

describe("findNonPublishedRecords — titles and unpublished-only sources", () => {
    it("returns the in-review event with its title and its unpublished-only sources", () => {
        const sandbox = makeSandbox();
        const contentDir = path.join(sandbox, "src", "content", "history");
        // Adam and Eve is published now, so the sandbox's only
        // non-published event is Creation (flipped to in-review by
        // makeSandbox) — with the three sources cited only by it.
        // McDowell, Met, and ORACC are no longer unpublished-only:
        // the published Adam and Eve event cites them too. Brown,
        // Crouch, and Shabaka follow in Creation's citation order.
        expect(findNonPublishedRecords({ contentDir })).toEqual([
            { id: "event-creation", kind: "event", status: "in-review", title: "Creation" },
            {
                id: "source-brown-cosmic-temple",
                kind: "source",
                status: "unpublished-only",
                title: "The Cosmic Temple: Cosmogony According to Genesis 1:1–2:3",
            },
            {
                id: "source-crouch-image-of-god",
                kind: "source",
                status: "unpublished-only",
                title: "Made in the Image of God: The Creation of אדם, the Commissioning of the King and the Chaoskampf of YHWH",
            },
            {
                id: "source-british-museum-shabaka",
                kind: "source",
                status: "unpublished-only",
                title: "Shabaka Stone transcript and Hieroglyphs exhibition guide (EA498)",
            },
            // source-kantor-genesis-opening is deliberately absent: it is
            // kept unreferenced in the shared registry (editorial
            // corrections, 2026-11-11) so no event cites it, and the gate
            // only lists sources cited by non-published events.
        ]);
    });
});

describe("checkHistoryGate — claims detector", () => {
    // A sandbox where BOTH events are published: the claims detector
    // must fire on this all-published path, where the gate's
    // non-published early return would otherwise stand it down. The
    // fixture source still carries Adam and Eve's full 35-claim
    // register (including unverified 028 and 030b); generation strips
    // it, and these tests prove the gate catches it if it ever leaks.
    function makeAllPublishedSandbox() {
        const sandbox = makeSandbox();
        for (const name of ["creation.json", "adam-and-eve.json"]) {
            const eventPath = path.join(sandbox, "src", "content", "history", "events", name);
            const event = JSON.parse(readFileSync(eventPath, "utf8"));
            event.status = "published";
            writeFileSync(eventPath, JSON.stringify(event, null, 2));
        }
        // Check 10 applies to published events: mark every source
        // verified so the fixture validates without an override.
        const registryPath = path.join(sandbox, "src", "content", "history", "sources", "references.json");
        const registry = JSON.parse(readFileSync(registryPath, "utf8"));
        for (const source of Object.values(registry)) {
            source.verification = "verified";
        }
        writeFileSync(registryPath, JSON.stringify(registry, null, 2));
        return sandbox;
    }

    function buildPublished(sandbox) {
        const result = runNode("scripts/build-history-content.js", { cwd: sandbox });
        expect(result.status).toBe(0);
        expect(readManifest(sandbox).events).toEqual(["event-adam-and-eve", "event-creation"]);
        expect(readManifest(sandbox).includeUnpublished).toBe(false);
    }

    it("passes a clean all-published build — conn-ae-018's prose 'claims' is not a leak", () => {
        const sandbox = makeAllPublishedSandbox();
        buildPublished(sandbox);
        // The generated Adam and Eve JSON carries conn-ae-018's note,
        // which contains the bare word "claims" ("…this note claims it
        // for the Genesis 2–3 reversal…") — the detector must not fire
        // on that, in generated output or in a built asset.
        const generated = JSON.parse(readFileSync(
            path.join(sandbox, "src", "generated", "history", "events", "adam-and-eve.json"), "utf8",
        ));
        expect(generated).not.toHaveProperty("claims");
        expect(JSON.stringify(generated.connections)).toContain("this note claims it for the Genesis 2–3 reversal");
        writeDistFile(sandbox, "assets/app.js", 'const note = "Creation already connects this range (conn-cre-028) for the creation motifs, and this note claims it for the Genesis 2–3 reversal specifically.";');
        const result = runGate(sandbox);
        expect(result.status).toBe(0);
        expect(result.stdout).toMatch(/no non-published records exist/);
        // ... while the SOURCE still carries the full register.
        const source = JSON.parse(readFileSync(
            path.join(sandbox, "src", "content", "history", "events", "adam-and-eve.json"), "utf8",
        ));
        expect(source.claims).toHaveLength(35);
        expect(source.claims.map((claim) => claim.id)).toContain("clm-ae-028");
        expect(source.claims.map((claim) => claim.id)).toContain("clm-ae-030b");
    });

    it("fails when a generated event JSON carries a claims register", () => {
        const sandbox = makeAllPublishedSandbox();
        buildPublished(sandbox);
        // Simulate a leak: reintroduce the claims register into the
        // generated copy, as a pre-fix generator would have written it.
        const generatedPath = path.join(sandbox, "src", "generated", "history", "events", "adam-and-eve.json");
        const generated = JSON.parse(readFileSync(generatedPath, "utf8"));
        const source = JSON.parse(readFileSync(
            path.join(sandbox, "src", "content", "history", "events", "adam-and-eve.json"), "utf8",
        ));
        generated.claims = source.claims;
        writeFileSync(generatedPath, JSON.stringify(generated, null, 2));
        const result = runGate(sandbox);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/History gate FAILED/);
        expect(result.stderr).toMatch(/adam-and-eve\.json/);
        expect(result.stderr).toMatch(/claims/);
        expect(result.stderr).toMatch(/event-adam-and-eve/);
    });

    it('fails when dist/ contains a serialized "claims": key', () => {
        const sandbox = makeAllPublishedSandbox();
        buildPublished(sandbox);
        writeDistFile(sandbox, "assets/app.js", 'const data = {"claims": [{"id": "clm-ae-028", "claim": "The tree of life functioned as a reward for obedience (unmentioned until 3:22)."}]};');
        const result = runGate(sandbox);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/History gate FAILED/);
        expect(result.stderr).toMatch(/"claims":/);
    });

    it("fails when dist/ contains the inlined unquoted claims: key (compiled form)", () => {
        const sandbox = makeAllPublishedSandbox();
        buildPublished(sandbox);
        // Rolldown inlines generated JSON with unquoted keys: the leaked
        // register shows up as `claims:()=>u`, with no `"claims":` and
        // no claim id for the other patterns to catch.
        writeDistFile(sandbox, "assets/app.js", 'const e={id:"event-adam-and-eve",claims:()=>u};');
        const result = runGate(sandbox);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/History gate FAILED/);
        expect(result.stderr).toMatch(/unquoted claims:/);
        expect(result.stderr).toMatch(/assets\/app\.js/);
        // Only the unquoted-key detection fires on this fixture.
        expect(result.stderr).not.toMatch(/internal claim id/);
        expect(result.stderr).not.toMatch(/serialized "claims":/);
    });

    it("fails when dist/ contains an unquoted claims: array of register rows", () => {
        const sandbox = makeAllPublishedSandbox();
        buildPublished(sandbox);
        writeDistFile(sandbox, "assets/app.js", 'const e={id:"event-adam-and-eve",claims:[{id:"clm-ae-028",claim:"The tree of life functioned as a reward for obedience."}]};');
        const result = runGate(sandbox);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/History gate FAILED/);
        expect(result.stderr).toMatch(/unquoted claims:/);
        // The register rows inside the array trip the claim-id pattern too.
        expect(result.stderr).toMatch(/internal claim id/);
    });

    it("fails when dist/ contains a bare claim id with no claims key at all", () => {
        const sandbox = makeAllPublishedSandbox();
        buildPublished(sandbox);
        writeDistFile(sandbox, "assets/app.js", 'const note = "see clm-ae-028 for the unverified tree-of-life claim";');
        const result = runGate(sandbox);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/History gate FAILED/);
        expect(result.stderr).toMatch(/internal claim id/);
        expect(result.stderr).toMatch(/assets\/app\.js/);
        // Only the claim-id detection fires on this fixture.
        expect(result.stderr).not.toMatch(/unquoted claims:/);
        expect(result.stderr).not.toMatch(/serialized "claims":/);
    });

    it("passes dist/ prose containing 'claims:' not after { or ,", () => {
        const sandbox = makeAllPublishedSandbox();
        buildPublished(sandbox);
        // Prose "claims:" after a space (and the bare word "claims"
        // without a colon, as in adam-and-eve.json's evidence field)
        // must not trip the anchored unquoted-key pattern.
        writeDistFile(sandbox, "assets/app.js", 'const note = "He claims: \\"the text says otherwise.\\" No scholar consulted claims borrowing.";');
        const result = runGate(sandbox);
        expect(result.status).toBe(0);
        expect(result.stdout).toMatch(/no non-published records exist/);
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
        expect(readManifest(sandbox).events).toEqual(["event-adam-and-eve"]);
        const text = distText(sandbox);
        expect(text).not.toContain("event-creation");
        expect(text).not.toContain("Creation");
        expect(text).not.toContain("source-brown-cosmic-temple");
        expect(text).not.toContain("The Cosmic Temple: Cosmogony According to Genesis 1:1–2:3");
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
