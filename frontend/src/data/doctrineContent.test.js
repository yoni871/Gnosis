// Tests for the Doctrine content pipeline (`scripts/
// doctrine-content-lib.js`): the build-time generator and the
// post-build publication gate.
//
// Every research fixture here is SYNTHETIC — written for testing
// only, clearly labelled as such, and never presented as verified
// historical evidence. The theologians named are historical figures,
// but every quotation, title, date, and citation attached to them in
// these fixtures is invented test data. The tests pin the pipeline's
// honesty rules: only adapter-gated records reach the generated
// study, the generator fails closed on invalid records, and the gate
// catches any unpublished title, date, quotation, explanation, or id
// that reaches the generated file or the built bundle.
//
// The generator and gate run against temporary research trees built
// in this file, never against the real tree and never against the
// real generated directory.
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    checkDoctrineGate,
    findNonPublishedDoctrineRecords,
    generateDoctrineContent,
} from "../../scripts/doctrine-content-lib.js";

const tempDirs = [];
afterEach(() => {
    while (tempDirs.length > 0) {
        rmSync(tempDirs.pop(), { recursive: true, force: true });
    }
});

function verificationRecord(overrides = {}) {
    return {
        id: "ver-synth-001",
        claimId: "synth-claim",
        claimText: "Synthetic claim text for testing only.",
        claimType: "passage-link",
        sourcesChecked: [{ source: "Synthetic source for testing only.", dateAccessed: "2026-11-25" }],
        checker: "synthetic-checker",
        checkDate: "2026-11-25",
        result: "verified",
        evidenceFound: "Synthetic evidence for testing only.",
        editorialApproval: { approvedBy: "synthetic-editor", date: "2026-11-25", note: null },
        limitations: null,
        notes: null,
        ...overrides,
    };
}

function passageRecord(overrides = {}) {
    return {
        id: "synth-gen-1-26",
        doctrine: "trinity",
        book: "Genesis",
        chapter: 1,
        verseStart: 26,
        verseEnd: 26,
        canonicalOrder: 1,
        status: "editorially-approved",
        evidenceClassification: "direct",
        relationshipToDoctrine: { text: "Synthetic relationship for testing only.", status: "editorially-approved" },
        crossReferences: [],
        interpretiveQuestions: [],
        verificationRecordIds: ["ver-synth-001"],
        notes: null,
        ...overrides,
    };
}

function authorRecord(overrides = {}) {
    return {
        id: "synth-justin",
        displayName: "Synthetic Justin",
        status: "verified",
        bio: null,
        dates: null,
        verificationRecordIds: [],
        notes: null,
        ...overrides,
    };
}

function workRecord(overrides = {}) {
    return {
        id: "synth-first-apology",
        status: "editorially-approved",
        authorIds: ["synth-justin"],
        title: "Synthetic First Apology",
        shortTitle: null,
        edition: null,
        editor: null,
        translator: null,
        originalLanguage: null,
        dateWritten: { certainty: "approximate", earliest: 155, latest: null, note: null },
        disputedAuthorship: false,
        publicationInfo: null,
        locator: null,
        publicDomainStatus: "public-domain",
        verificationRecordIds: ["ver-synth-001"],
        notes: null,
        ...overrides,
    };
}

function interpretationRecord(overrides = {}) {
    return {
        id: "synth-interp-001",
        passageId: "synth-gen-1-26",
        authorId: "synth-justin",
        workId: "synth-first-apology",
        status: "editorially-approved",
        quotation: {
            text: "Synthetic published quotation about the Trinity, uniquely worded for the gate test.",
            language: "English",
            translation: "Synthetic translation",
            edition: "Synthetic edition",
            location: "ch. 1",
            summary: null,
            reproducibilityStatus: "public-domain",
        },
        explanation: "Synthetic published explanation, written for the fixture.",
        historicalContext: null,
        relationshipToDoctrine: null,
        citation: null,
        alternativeReadings: [],
        verificationRecordIds: ["ver-synth-001"],
        notes: null,
        ...overrides,
    };
}

// A tree with one publishable passage/interpretation/work and one
// withheld set: an in-research passage with a verified-but-unapproved
// interpretation, and an in-research work with a title and date that
// must never reach the generated study.
function mixedTree() {
    return {
        passages: [
            passageRecord(),
            passageRecord({
                id: "synth-john-1-1",
                book: "John",
                chapter: 1,
                verseStart: 1,
                verseEnd: 3,
                canonicalOrder: 43,
                status: "in-research",
                verificationRecordIds: ["ver-synth-002"],
            }),
        ],
        authors: [authorRecord()],
        works: [
            workRecord(),
            workRecord({
                id: "synth-unpublished-treatise",
                status: "in-research",
                title: "Synthetic Unpublished Treatise on the Trinity",
                dateWritten: { certainty: "approximate", earliest: 300, latest: null, note: null },
                verificationRecordIds: [],
            }),
        ],
        interpretations: [
            interpretationRecord(),
            interpretationRecord({
                id: "synth-interp-002",
                passageId: "synth-john-1-1",
                workId: "synth-unpublished-treatise",
                status: "verified",
                quotation: {
                    text: "Synthetic unpublished quotation that must never appear in the bundle.",
                    language: "English",
                    translation: "Synthetic translation",
                    edition: "Synthetic edition",
                    location: "ch. 2",
                    summary: null,
                    reproducibilityStatus: "public-domain",
                },
                explanation: "Synthetic unpublished explanation, written for the gate test.",
                verificationRecordIds: ["ver-synth-002"],
            }),
        ],
        verificationRecords: [
            verificationRecord(),
            verificationRecord({ id: "ver-synth-002", editorialApproval: null }),
        ],
    };
}

function writeTree(tree) {
    const root = mkdtempSync(path.join(tmpdir(), "doctrine-content-"));
    tempDirs.push(root);
    const researchDir = path.join(root, "research", "trace-the-doctrine");
    mkdirSync(path.join(researchDir, "trinity"), { recursive: true });
    mkdirSync(path.join(researchDir, "shared"), { recursive: true });
    writeFileSync(path.join(researchDir, "trinity", "passages.json"), JSON.stringify(tree.passages, null, 2));
    writeFileSync(path.join(researchDir, "trinity", "interpretations.json"), JSON.stringify(tree.interpretations, null, 2));
    writeFileSync(
        path.join(researchDir, "trinity", "verification-records.json"),
        JSON.stringify(tree.verificationRecords, null, 2),
    );
    writeFileSync(path.join(researchDir, "shared", "authors.json"), JSON.stringify(tree.authors, null, 2));
    writeFileSync(path.join(researchDir, "shared", "works.json"), JSON.stringify(tree.works, null, 2));
    return {
        researchDir,
        outputDir: path.join(root, "generated", "doctrine"),
        distDir: path.join(root, "dist"),
    };
}

function generatedStudy(outputDir) {
    return JSON.parse(readFileSync(path.join(outputDir, "trinity.json"), "utf8"));
}

describe("doctrine content generator", () => {
    it("writes only the publishable records, with untrusted titles and dates withheld", () => {
        const { researchDir, outputDir } = writeTree(mixedTree());
        const result = generateDoctrineContent({ researchDir, outputDir });
        expect(result.publishedPassages).toBe(1);
        expect(result.publishedInterpretations).toBe(1);
        expect(result.publishedWorks).toBe(2);
        expect(result.publishedFigures).toBe(1);

        const study = generatedStudy(outputDir);
        expect(study.doctrine).toBe("trinity");
        expect(study.published.passages.map((passage) => passage.id)).toEqual(["synth-gen-1-26"]);
        expect(study.published.interpretations.map((entry) => entry.id)).toEqual(["synth-interp-001"]);
        expect(study.published.passageInterpretations).toEqual({ "synth-gen-1-26": ["synth-interp-001"] });
        // The trusted work keeps its title and date; the untrusted
        // work is present (its id and figure link are structural) with
        // title null and date pending.
        const trusted = study.published.works.find((work) => work.id === "synth-first-apology");
        expect(trusted.title).toBe("Synthetic First Apology");
        expect(trusted.date.label).toBe("c. AD 155");
        const untrusted = study.published.works.find((work) => work.id === "synth-unpublished-treatise");
        expect(untrusted.title).toBeNull();
        expect(untrusted.date.status).toBe("pending");
        // No withheld string anywhere in the generated file.
        const text = readFileSync(path.join(outputDir, "trinity.json"), "utf8");
        expect(text).not.toContain("Synthetic Unpublished Treatise on the Trinity");
        expect(text).not.toContain("c. AD 300");
        expect(text).not.toContain("Synthetic unpublished quotation that must never appear in the bundle.");
        expect(text).not.toContain("synth-john-1-1");
        expect(text).not.toContain("synth-interp-002");
    });

    it("writes an empty study when nothing is publishable", () => {
        const tree = mixedTree();
        tree.passages = tree.passages.map((passage) => ({ ...passage, status: "in-research" }));
        tree.interpretations = tree.interpretations.map((entry) => ({ ...entry, status: "in-research" }));
        tree.works = tree.works.map((work) => ({ ...work, status: "in-research" }));
        const { researchDir, outputDir } = writeTree(tree);
        const result = generateDoctrineContent({ researchDir, outputDir });
        expect(result.publishedPassages).toBe(0);
        expect(result.publishedInterpretations).toBe(0);
        const study = generatedStudy(outputDir);
        expect(study.published.passages).toEqual([]);
        expect(study.published.interpretations).toEqual([]);
        expect(study.published.passageInterpretations).toEqual({});
    });

    it("writes an empty study for an empty tree", () => {
        const { researchDir, outputDir } = writeTree({
            passages: [],
            authors: [],
            works: [],
            interpretations: [],
            verificationRecords: [],
        });
        const result = generateDoctrineContent({ researchDir, outputDir });
        expect(result.publishedPassages).toBe(0);
        expect(existsSync(path.join(outputDir, "trinity.json"))).toBe(true);
    });

    it("fails closed on an invalid record instead of dropping it silently", () => {
        const tree = mixedTree();
        delete tree.passages[0].canonicalOrder;
        const { researchDir, outputDir } = writeTree(tree);
        expect(() => generateDoctrineContent({ researchDir, outputDir })).toThrow(/validation failed/);
        expect(existsSync(path.join(outputDir, "trinity.json"))).toBe(false);
    });

    it("fails closed when a research file is missing", () => {
        const root = mkdtempSync(path.join(tmpdir(), "doctrine-content-"));
        tempDirs.push(root);
        const researchDir = path.join(root, "research", "trace-the-doctrine");
        mkdirSync(path.join(researchDir, "trinity"), { recursive: true });
        mkdirSync(path.join(researchDir, "shared"), { recursive: true });
        expect(() => generateDoctrineContent({ researchDir, outputDir: path.join(root, "generated") })).toThrow(
            /missing research file/,
        );
    });
});

describe("doctrine content gate", () => {
    it("passes on the clean generated study, with or without dist/", () => {
        const { researchDir, outputDir, distDir } = writeTree(mixedTree());
        generateDoctrineContent({ researchDir, outputDir });
        expect(checkDoctrineGate({ researchDir, generatedDir: outputDir }).failures).toEqual([]);
        mkdirSync(distDir, { recursive: true });
        writeFileSync(
            path.join(distDir, "app.js"),
            "Synthetic published quotation about the Trinity, uniquely worded for the gate test.",
        );
        const { failures } = checkDoctrineGate({ researchDir, generatedDir: outputDir, distDir });
        expect(failures).toEqual([]);
    });

    it("fails when the generated file is missing or stale", () => {
        const { researchDir, outputDir } = writeTree(mixedTree());
        expect(checkDoctrineGate({ researchDir, generatedDir: outputDir }).failures.length).toBeGreaterThan(0);
        generateDoctrineContent({ researchDir, outputDir });
        expect(checkDoctrineGate({ researchDir, generatedDir: outputDir }).failures).toEqual([]);
        // Hand-edit the file to list an unpublished passage: the
        // freshness check and the leak scan must both catch it.
        const study = generatedStudy(outputDir);
        study.published.passages.push({ id: "synth-john-1-1" });
        writeFileSync(path.join(outputDir, "trinity.json"), JSON.stringify(study, null, 2));
        const { failures } = checkDoctrineGate({ researchDir, generatedDir: outputDir });
        expect(failures.length).toBeGreaterThan(0);
        expect(failures.join("\n")).toContain("synth-john-1-1");
    });

    it("fails when dist/ contains an unpublished quotation or title", () => {
        const { researchDir, outputDir, distDir } = writeTree(mixedTree());
        generateDoctrineContent({ researchDir, outputDir });
        mkdirSync(distDir, { recursive: true });
        writeFileSync(
            path.join(distDir, "app.js"),
            "bundle… Synthetic unpublished quotation that must never appear in the bundle. …end",
        );
        let result = checkDoctrineGate({ researchDir, generatedDir: outputDir, distDir });
        expect(result.failures.length).toBeGreaterThan(0);
        expect(result.failures.join("\n")).toContain("synth-interp-002");

        writeFileSync(path.join(distDir, "app.js"), "bundle… Synthetic Unpublished Treatise on the Trinity …end");
        result = checkDoctrineGate({ researchDir, generatedDir: outputDir, distDir });
        expect(result.failures.length).toBeGreaterThan(0);
        expect(result.failures.join("\n")).toContain("synth-unpublished-treatise");
    });

    it("fails when dist/ contains an unpublished work date label", () => {
        const { researchDir, outputDir, distDir } = writeTree(mixedTree());
        generateDoctrineContent({ researchDir, outputDir });
        mkdirSync(distDir, { recursive: true });
        writeFileSync(path.join(distDir, "app.js"), "date: c. AD 300");
        const { failures } = checkDoctrineGate({ researchDir, generatedDir: outputDir, distDir });
        expect(failures.length).toBeGreaterThan(0);
        expect(failures.join("\n")).toContain("synth-unpublished-treatise");
    });

    it("skips a leak string that also appears in published content", () => {
        // The unpublished work carries the same title as the published
        // one: its presence in dist/ is explained by the published
        // record, so the title check is skipped with a warning and
        // the gate still passes on the id check alone.
        const tree = mixedTree();
        tree.works[1].title = "Synthetic First Apology";
        const { researchDir, outputDir, distDir } = writeTree(tree);
        generateDoctrineContent({ researchDir, outputDir });
        mkdirSync(distDir, { recursive: true });
        writeFileSync(path.join(distDir, "app.js"), "Synthetic First Apology");
        const { failures, warnings } = checkDoctrineGate({ researchDir, generatedDir: outputDir, distDir });
        expect(failures).toEqual([]);
        expect(warnings.length).toBeGreaterThan(0);
        expect(warnings.join("\n")).toContain("also appears in published content");
    });
});

describe("doctrine non-published records", () => {
    it("lists the withheld records with their leak strings", () => {
        const { researchDir } = writeTree(mixedTree());
        const nonPublished = findNonPublishedDoctrineRecords({ researchDir });
        const byId = new Map(nonPublished.map((record) => [record.id, record]));
        expect(byId.get("synth-john-1-1").kind).toBe("passage");
        expect(byId.get("synth-john-1-1").strings).toEqual([{ type: "id", text: "synth-john-1-1" }]);
        const interp = byId.get("synth-interp-002");
        expect(interp.kind).toBe("interpretation");
        expect(interp.strings.map((entry) => entry.type)).toEqual(["id", "quotation", "explanation"]);
        const work = byId.get("synth-unpublished-treatise");
        expect(work.kind).toBe("work");
        expect(work.strings).toEqual([
            { type: "title", text: "Synthetic Unpublished Treatise on the Trinity" },
            { type: "date", text: "c. AD 300" },
        ]);
        // The publishable records are not listed.
        expect(byId.has("synth-gen-1-26")).toBe(false);
        expect(byId.has("synth-interp-001")).toBe(false);
        expect(byId.has("synth-first-apology")).toBe(false);
    });
});
