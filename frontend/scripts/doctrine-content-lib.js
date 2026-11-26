// Doctrine content pipeline (Trace the Doctrine, Trinity first).
//
// Reads the research tree (research/trace-the-doctrine/), runs the
// frontend adapter's standards §10 publication gate over it, and
// writes the published-only study the Trinity page renders into the
// gitignored frontend/src/generated/doctrine/ directory — one JSON
// file per doctrine (`trinity.json`).
//
// The generated file carries ONLY publishable records: passages and
// interpretations that pass the gate, works with trust-adjusted
// titles/dates, and every structurally valid author. Draft research
// never enters the file, so it can never enter the frontend bundle —
// the page imports only the generated file, never the research tree
// (see frontend/src/data/doctrineStudy.js).
//
// Fail-closed: any error-severity adapter issue (an invalid record,
// a dangling reference, a duplicate id) throws, and the build fails
// instead of silently dropping the record. Warnings are reported but
// do not fail the build. There is no dev/unpublished flag for
// doctrine content — every build is published-only, by design; the
// History track's --include-unpublished escape hatch does not exist
// here, so a stray flag can never leak draft research into a build.
//
// The post-build gate (checkDoctrineGate, below) re-verifies the
// generated file and dist/ independently of this generator: the two
// are separate checks on the same guarantee, so a bug in one cannot
// silently clear the other.
//
// "Published" needs nothing beyond the existing contract: a record is
// publishable exactly when the adapter's §10 gate says so — its own
// status is `editorially-approved` or `published`, and every cited
// verification record exists, is `verified`, and carries
// `editorialApproval`. No new field, no new status, no editorial
// decision is introduced here.

import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import path from "node:path";
// The adapter lives under frontend/src/data/; this lib lives in
// frontend/scripts/, so the import goes through ../src/.
import {
    adaptResearchData,
    formatWorkDate,
    isPublishable,
    validateRecord,
} from "../src/data/researchAdapter.js";

function readJson(file) {
    return JSON.parse(readFileSync(file, "utf8"));
}

function listFilesRecursive(dir) {
    const out = [];
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listFilesRecursive(full));
        else if (entry.isFile()) out.push(full);
    }
    return out;
}

function truncate(text, length = 60) {
    return text.length > length ? `${text.slice(0, length)}…` : text;
}

// Read the research bundle for one doctrine. The tree files must all
// exist and hold JSON arrays — a missing or malformed file is a repo
// error, and the build fails closed rather than generating a partial
// study from half a tree.
function readDoctrineBundle({ researchDir, doctrine }) {
    const read = (relative) => {
        const file = path.join(researchDir, relative);
        if (!existsSync(file)) {
            throw new Error(`Doctrine content: missing research file ${file}.`);
        }
        const data = readJson(file);
        if (!Array.isArray(data)) {
            throw new Error(`Doctrine content: ${file} must hold a JSON array.`);
        }
        return data;
    };
    return {
        doctrine,
        passages: read(path.join(doctrine, "passages.json")),
        authors: read(path.join("shared", "authors.json")),
        works: read(path.join("shared", "works.json")),
        interpretations: read(path.join(doctrine, "interpretations.json")),
        verificationRecords: read(path.join(doctrine, "verification-records.json")),
    };
}

// Index the structurally valid verification records by id, first
// wins on a duplicate — the same rule the adapter applies, so the
// gate below agrees with the adapter about what is publishable.
function indexValidVerificationRecords(records) {
    const byId = new Map();
    for (const record of records) {
        if (!record || typeof record !== "object") continue;
        if (validateRecord("verificationRecord", record).some((entry) => entry.severity === "error")) {
            continue;
        }
        if (!byId.has(record.id)) byId.set(record.id, record);
    }
    return byId;
}

// Generate the published-only study for one doctrine.
//
// Returns `{ doctrine, generatedAt, publishedPassages,
// publishedInterpretations, publishedWorks, publishedFigures,
// excluded, issues }`. With nothing publishable — the state of the
// research today — the file is still written, with empty published
// arrays, so the page keeps rendering the demonstration study.
export function generateDoctrineContent({ researchDir, outputDir, doctrine = "trinity" }) {
    const bundle = readDoctrineBundle({ researchDir, doctrine });
    const adapted = adaptResearchData(bundle);
    const errors = adapted.issues.filter((entry) => entry.severity === "error");
    if (errors.length > 0) {
        throw new Error(
            `Doctrine content validation failed:\n${errors
                .map((entry) => `  - [${entry.kind} ${entry.id ?? "?"}] ${entry.message}`)
                .join("\n")}`,
        );
    }
    rmSync(outputDir, { recursive: true, force: true });
    mkdirSync(outputDir, { recursive: true });
    const generated = {
        doctrine,
        generatedAt: new Date().toISOString(),
        published: adapted.published,
    };
    writeFileSync(path.join(outputDir, `${doctrine}.json`), `${JSON.stringify(generated, null, 2)}\n`);
    return {
        doctrine,
        generatedAt: generated.generatedAt,
        publishedPassages: adapted.published.passages.length,
        publishedInterpretations: adapted.published.interpretations.length,
        publishedWorks: adapted.published.works.length,
        publishedFigures: adapted.published.figures.length,
        excluded: adapted.excluded,
        issues: adapted.issues,
    };
}

// Every record the gate withholds, with the strings that must not
// appear in the generated file or the built bundle: ids for passages
// and interpretations, titles and writing-date labels for works, and
// quotation texts and explanations for interpretations. Author
// display names are not leak strings — the adapter publishes every
// structurally valid author as a figure, so names appear in the
// published output by design. Passage labels are public Scripture
// references, not research content, and are likewise not checked.
export function findNonPublishedDoctrineRecords({ researchDir, doctrine = "trinity" }) {
    const bundle = readDoctrineBundle({ researchDir, doctrine });
    const adapted = adaptResearchData(bundle);
    const verificationRecordsById = indexValidVerificationRecords(bundle.verificationRecords);
    const publishedPassageIds = new Set(adapted.published.passages.map((passage) => passage.id));
    const publishedInterpretationIds = new Set(
        adapted.published.interpretations.map((interpretation) => interpretation.id),
    );
    const nonPublished = [];
    for (const passage of bundle.passages) {
        if (publishedPassageIds.has(passage.id)) continue;
        nonPublished.push({
            kind: "passage",
            id: passage.id,
            strings: [{ type: "id", text: passage.id }],
        });
    }
    for (const interpretation of bundle.interpretations) {
        if (publishedInterpretationIds.has(interpretation.id)) continue;
        const strings = [{ type: "id", text: interpretation.id }];
        const quotationText = interpretation.quotation?.text;
        if (typeof quotationText === "string" && quotationText.length > 0) {
            strings.push({ type: "quotation", text: quotationText });
        }
        const explanation = interpretation.explanation;
        if (typeof explanation === "string" && explanation.length >= 40) {
            strings.push({ type: "explanation", text: explanation });
        }
        nonPublished.push({ kind: "interpretation", id: interpretation.id, strings });
    }
    for (const work of bundle.works) {
        // A work is trusted only when it passes the §10 gate itself —
        // the same rule the adapter applies when it trust-adjusts the
        // title and date. Structurally invalid works are withheld too;
        // the generator already fails the build on those.
        const valid = !validateRecord("work", work).some((entry) => entry.severity === "error");
        if (valid && isPublishable(work, verificationRecordsById)) continue;
        const strings = [];
        if (typeof work.title === "string" && work.title.length > 0) {
            strings.push({ type: "title", text: work.title });
        }
        const date = formatWorkDate(work.dateWritten);
        if (date.status === "verified") {
            strings.push({ type: "date", text: date.label });
        }
        nonPublished.push({ kind: "work", id: work.id, strings });
    }
    return nonPublished;
}

// The post-build publication gate. Re-verifies, independently of the
// generator: the generated file is exactly what the current tree
// produces, and no unpublished title, date, quotation, explanation,
// or id appears in the generated file or in dist/.
//
// Returns `{ failures, warnings }`. A failure fails the build.
// Warnings record the strings that could not be checked by substring
// — a title too generic to match safely, or a string that also
// appears in published content (its presence is explained by the
// published record) — and never clear a failure.
export function checkDoctrineGate({ researchDir, generatedDir, distDir, doctrine = "trinity", demoFile = null }) {
    const failures = [];
    const warnings = [];
    const generatedPath = path.join(generatedDir, `${doctrine}.json`);
    let generated = null;
    let generatedText = "";
    if (!existsSync(generatedPath)) {
        failures.push(`generated ${doctrine}.json is missing — run the Doctrine content build first.`);
    } else {
        generatedText = readFileSync(generatedPath, "utf8");
        try {
            generated = JSON.parse(generatedText);
        } catch {
            failures.push(`generated ${doctrine}.json is not valid JSON.`);
        }
    }

    // The generated file must be exactly what the current tree
    // produces: any drift — a stale file, a hand edit — fails.
    const bundle = readDoctrineBundle({ researchDir, doctrine });
    const fresh = adaptResearchData(bundle);
    if (generated !== null) {
        if (generated.doctrine !== doctrine) {
            failures.push(
                `generated ${doctrine}.json names doctrine ${JSON.stringify(generated.doctrine)} — expected ${JSON.stringify(doctrine)}.`,
            );
        }
        if (JSON.stringify(generated.published ?? null) !== JSON.stringify(fresh.published)) {
            failures.push(
                `generated ${doctrine}.json does not match the current research tree — run the Doctrine content build first.`,
            );
        }
    }

    const nonPublished = findNonPublishedDoctrineRecords({ researchDir, doctrine });
    const publishedText = JSON.stringify(fresh.published);

    // The demonstration study's text, when a demo file is given: the
    // workspace renders labeled sample data while nothing is
    // publishable, and that sample data ships in the bundle by design.
    // Its passage ids are the same strings as the real passages' ids
    // (the demo stands in for those passages), so an id's presence in
    // dist/ is explained — not a leak — when the demo study contains
    // it. The demo carries no research titles, dates, quotations, or
    // explanations (all null), so this explains ids only in practice.
    // A missing demo file leaves the text empty and the gate strict.
    let demoText = "";
    if (demoFile && existsSync(demoFile)) {
        demoText = readFileSync(demoFile, "utf8");
    }

    // A leak string is checked by substring against `text`. A string
    // whose presence is explained by `explainedText` — the published
    // output, and for dist/ also the demonstration study — is skipped
    // with a warning instead of failing. Ids are skipped only when
    // `allowIdSkip` is set: the generated file holds only published
    // records, so any non-published id there is a real leak and is
    // never skipped; in dist/ an id the demo study contains is
    // explained by the demo. A title too generic to check by
    // substring is skipped the same way — a bare short word matches
    // published prose that merely mentions it.
    const checkText = (label, text, explainedText, allowIdSkip) => {
        for (const record of nonPublished) {
            for (const entry of record.strings) {
                if (entry.type === "id") {
                    if (allowIdSkip && explainedText.includes(entry.text)) {
                        warnings.push(
                            `non-published ${record.kind} id "${entry.text}" also appears in published content or the demonstration study — the occurrence in ${label} is explained by that source.`,
                        );
                        continue;
                    }
                    if (text.includes(entry.text)) {
                        failures.push(`${label} contains non-published ${record.kind} id "${entry.text}".`);
                    }
                    continue;
                }
                if (entry.type === "title" && (entry.text.length < 10 || !/[\s\-:;,.]/.test(entry.text))) {
                    warnings.push(
                        `non-published ${record.kind} title "${entry.text}" (id "${record.id}") is too generic to check by substring — the id check still applies.`,
                    );
                    continue;
                }
                if (explainedText.includes(entry.text)) {
                    warnings.push(
                        `non-published ${record.kind} ${entry.type} "${truncate(entry.text)}" (id "${record.id}") also appears in published content or the demonstration study — the id check still applies.`,
                    );
                    continue;
                }
                if (text.includes(entry.text)) {
                    failures.push(
                        `${label} contains non-published ${record.kind} ${entry.type} "${truncate(entry.text)}" (id "${record.id}").`,
                    );
                }
            }
        }
    };

    if (generatedText.length > 0) {
        checkText(`generated ${doctrine}.json`, generatedText, publishedText, false);
    }
    if (distDir && existsSync(distDir)) {
        for (const file of listFilesRecursive(distDir)) {
            let text;
            try {
                text = readFileSync(file, "utf8");
            } catch {
                continue;
            }
            checkText(`dist/${path.relative(distDir, file)}`, text, `${publishedText}\n${demoText}`, true);
        }
    }
    return { failures, warnings };
}
