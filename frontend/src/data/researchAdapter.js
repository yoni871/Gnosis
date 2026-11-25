// Typed, validated research-data adapter for the Trace the Doctrine
// workspace.
//
// The adapter is the bridge between the research contract in
// `research/trace-the-doctrine/` (T1 schemas + RESEARCH-STANDARDS.md)
// and the workspace's UI shapes in `./doctrineStudies.js`. It takes a
// bundle of research records — passages, authors, works,
// interpretations, verification records — validates each record
// item-wise against the contract, and returns the same normalized
// shapes the workspace already consumes (`passages`, `figures`,
// `works`, `interpretations`, `passageInterpretations`), so the
// workspace can one day swap its data source with no component
// changes.
//
// THE GATE — the whole point of this module. Nothing is ever silently
// upgraded, and nothing draft is ever exposed as published:
//
// - A passage or interpretation reaches the published view only when
//   its own lifecycle status is `editorially-approved` or `published`
//   AND every verification record it cites exists, has result
//   `verified`, and carries editorial approval. A claim with no
//   verification record at all is never publishable (standards §10).
// - A work's title and writing date are trusted only under the same
//   gate. Anything else renders the pending labels — never an invented
//   or unverified year, title, or quotation.
// - A quotation's text is used only when its reproducibility status
//   allows reproduction (`public-domain`, `fair-use`,
//   `permission-granted`). When the status is `not-reproducible` the
//   text stays null and the researcher's summary is carried separately
//   as `quotationSummary` — prose, never rendered as a quotation.
// - Statuses are reported verbatim (`researchStatus`) and never
//   rewritten. "If in doubt whether something is verified, treat it
//   as unverified" (standards §10).
//
// Everything that does not pass is reported, not hidden: `excluded`
// lists the records kept out of the published view and why, and
// `issues` lists every validation problem found. The published view
// for today's research data is EMPTY — all 60 Trinity passages are
// `verification-pending` and no verification record carries editorial
// approval — and that is the correct, honest result.
//
// The adapter is pure functions with no React and no new dependency:
// structural validation is hand-written against the T1 schemas (the
// frontend has no JSON Schema engine, and none is added here). It does
// not read files, fetch, or touch the research directory — the caller
// supplies the bundle. It does not change the workspace's data source:
// the workspace still renders the labeled demonstration data until
// verified, editorially approved research is wired in by a later step.
import { DATE_PENDING_LABEL } from "./doctrineStudies";

// Lifecycle statuses, RESEARCH-STANDARDS.md §9.1.
export const LIFECYCLE_STATUSES = [
    "not-started",
    "in-research",
    "verification-pending",
    "verified",
    "editorially-approved",
    "published",
];

// A record's own status must be one of these for its content to be
// publishable at all. `verified` alone is NOT enough: a record that
// has been verified but not editorially approved must never be
// published (standards §10).
const PUBLISHABLE_STATUSES = ["editorially-approved", "published"];

const REPRODUCIBLE_STATUSES = ["public-domain", "fair-use", "permission-granted"];

const CLAIM_TYPES = [
    "quotation",
    "date",
    "attribution",
    "passage-link",
    "doctrinal-connection",
    "milestone",
];

const VERIFICATION_RESULTS = [
    "verified",
    "partially-verified",
    "not-verified",
    "contradicted",
    "unable-to-verify",
];

const EVIDENCE_CLASSIFICATIONS = ["direct", "indirect", "historically-interpreted"];

const DATE_CERTAINTIES = ["exact", "approximate", "range", "unknown"];

const DOCTRINES = ["trinity", "incarnation", "salvation", "holy-spirit", "church", "resurrection"];

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
    return typeof value === "string" && value.trim() !== "";
}

function isInteger(value) {
    return Number.isInteger(value);
}

// One validation problem. `severity` is "error" (the record is kept
// out of the published view) or "warning" (the record stays, degraded
// — e.g. an unknown extra field, or a work reference that resolves to
// the pending labels).
function issue(severity, kind, id, code, message) {
    return { severity, kind, id: id ?? null, code, message };
}

function checkString(record, field, issues, kind, { required = false, allowNull = false } = {}) {
    const value = record[field];
    if (value === undefined) {
        if (required) issues.push(issue("error", kind, record.id, "missing-field", `Missing required field "${field}".`));
        return;
    }
    if (value === null) {
        if (!allowNull) issues.push(issue("error", kind, record.id, "wrong-type", `Field "${field}" must be a string, got null.`));
        return;
    }
    if (typeof value !== "string") {
        issues.push(issue("error", kind, record.id, "wrong-type", `Field "${field}" must be a string.`));
    }
}

function checkEnum(record, field, values, issues, kind, { required = false, allowNull = false } = {}) {
    const value = record[field];
    if (value === undefined) {
        if (required) issues.push(issue("error", kind, record.id, "missing-field", `Missing required field "${field}".`));
        return;
    }
    if (value === null) {
        if (!allowNull) issues.push(issue("error", kind, record.id, "wrong-type", `Field "${field}" must be one of ${values.join(", ")}, got null.`));
        return;
    }
    if (!values.includes(value)) {
        issues.push(issue("error", kind, record.id, "invalid-enum", `Field "${field}" has value ${JSON.stringify(value)}, expected one of ${values.join(", ")}.`));
    }
}

function checkId(record, issues, kind) {
    const value = record.id;
    if (value === undefined) {
        issues.push(issue("error", kind, null, "missing-field", `Missing required field "id".`));
        return;
    }
    if (typeof value !== "string" || !ID_PATTERN.test(value)) {
        issues.push(issue("error", kind, typeof value === "string" ? value : null, "invalid-id", `Field "id" must be a lowercase kebab-case slug, got ${JSON.stringify(value)}.`));
    }
}

function checkStringArray(record, field, issues, kind, { required = false } = {}) {
    const value = record[field];
    if (value === undefined) {
        if (required) issues.push(issue("error", kind, record.id, "missing-field", `Missing required field "${field}".`));
        return;
    }
    if (!Array.isArray(value)) {
        issues.push(issue("error", kind, record.id, "wrong-type", `Field "${field}" must be an array.`));
        return;
    }
    for (const entry of value) {
        if (typeof entry !== "string") {
            issues.push(issue("error", kind, record.id, "wrong-type", `Field "${field}" must contain only strings.`));
            return;
        }
    }
}

function checkUnknownFields(record, knownFields, issues, kind) {
    for (const field of Object.keys(record)) {
        if (!knownFields.has(field)) {
            issues.push(issue("warning", kind, record.id, "unknown-field", `Unknown field "${field}" is not part of the contract and is ignored.`));
        }
    }
}

function checkDateObject(value, field, issues, kind, recordId) {
    if (value === null || value === undefined) return;
    if (!isPlainObject(value)) {
        issues.push(issue("error", kind, recordId, "wrong-type", `Field "${field}" must be an object or null.`));
        return;
    }
    if (!DATE_CERTAINTIES.includes(value.certainty)) {
        issues.push(issue("error", kind, recordId, "invalid-enum", `Field "${field}.certainty" must be one of ${DATE_CERTAINTIES.join(", ")}.`));
    }
    for (const yearField of ["earliest", "latest"]) {
        const year = value[yearField];
        if (year !== null && year !== undefined && !isInteger(year)) {
            issues.push(issue("error", kind, recordId, "wrong-type", `Field "${field}.${yearField}" must be an integer or null.`));
        }
    }
    if (value.note !== null && value.note !== undefined && typeof value.note !== "string") {
        issues.push(issue("error", kind, recordId, "wrong-type", `Field "${field}.note" must be a string or null.`));
    }
}

// Structural validation of one record against its T1 schema, item-wise.
// Returns the issues found; a record with any "error" issue is invalid
// and is kept out of the published view. The schemas' own
// `additionalProperties: false` is enforced as warnings: unknown fields
// are ignored, never silently trusted.
export function validateRecord(kind, record) {
    const issues = [];
    if (!isPlainObject(record)) {
        return [issue("error", kind, null, "not-an-object", "Record must be an object.")];
    }
    checkId(record, issues, kind);

    if (kind === "passage") {
        checkUnknownFields(record, new Set([
            "id", "doctrine", "book", "chapter", "verseStart", "verseEnd",
            "canonicalOrder", "status", "evidenceClassification",
            "relationshipToDoctrine", "crossReferences",
            "interpretiveQuestions", "verificationRecordIds", "notes",
        ]), issues, kind);
        checkEnum(record, "doctrine", DOCTRINES, issues, kind, { required: true });
        checkString(record, "book", issues, kind, { required: true });
        for (const field of ["chapter", "verseStart", "verseEnd"]) {
            const value = record[field];
            if (value === undefined) {
                issues.push(issue("error", kind, record.id, "missing-field", `Missing required field "${field}".`));
            } else if (!isInteger(value) || value < 1) {
                issues.push(issue("error", kind, record.id, "out-of-range", `Field "${field}" must be an integer of at least 1.`));
            }
        }
        const order = record.canonicalOrder;
        if (order === undefined) {
            issues.push(issue("error", kind, record.id, "missing-field", `Missing required field "canonicalOrder".`));
        } else if (!isInteger(order) || order < 1 || order > 66) {
            issues.push(issue("error", kind, record.id, "out-of-range", `Field "canonicalOrder" must be an integer between 1 and 66.`));
        }
        if (isInteger(record.verseStart) && isInteger(record.verseEnd) && record.verseEnd < record.verseStart) {
            issues.push(issue("error", kind, record.id, "invalid-range", `Field "verseEnd" (${record.verseEnd}) must not be before "verseStart" (${record.verseStart}).`));
        }
        checkEnum(record, "status", LIFECYCLE_STATUSES, issues, kind, { required: true });
        checkEnum(record, "evidenceClassification", EVIDENCE_CLASSIFICATIONS, issues, kind, { allowNull: true });
        checkStringArray(record, "verificationRecordIds", issues, kind);
        checkStringArray(record, "interpretiveQuestions", issues, kind);
        checkString(record, "notes", issues, kind, { allowNull: true });
        const relationship = record.relationshipToDoctrine;
        if (relationship !== null && relationship !== undefined) {
            if (!isPlainObject(relationship)) {
                issues.push(issue("error", kind, record.id, "wrong-type", `Field "relationshipToDoctrine" must be an object or null.`));
            } else {
                const nested = { ...relationship, id: record.id };
                checkEnum(nested, "status", LIFECYCLE_STATUSES, issues, kind, { required: true });
                // `text` is required by the schema (it may be null until
                // researched), so a missing key is an error, not an omission.
                checkString(nested, "text", issues, kind, { required: true, allowNull: true });
            }
        }
        const crossRefs = record.crossReferences;
        if (crossRefs !== undefined) {
            if (!Array.isArray(crossRefs)) {
                issues.push(issue("error", kind, record.id, "wrong-type", `Field "crossReferences" must be an array.`));
            } else {
                for (const ref of crossRefs) {
                    if (!isPlainObject(ref) || !isNonEmptyString(ref.passageId) || !isNonEmptyString(ref.note)) {
                        issues.push(issue("error", kind, record.id, "wrong-type", `Each "crossReferences" entry needs a "passageId" and a "note".`));
                        break;
                    }
                }
            }
        }
    }

    if (kind === "author") {
        checkUnknownFields(record, new Set([
            "id", "displayName", "status", "bio", "dates",
            "verificationRecordIds", "notes",
        ]), issues, kind);
        checkString(record, "displayName", issues, kind, { required: true });
        checkEnum(record, "status", LIFECYCLE_STATUSES, issues, kind, { required: true });
        checkString(record, "bio", issues, kind, { allowNull: true });
        checkString(record, "notes", issues, kind, { allowNull: true });
        checkStringArray(record, "verificationRecordIds", issues, kind);
        checkDateObject(record.dates, "dates", issues, kind, record.id);
    }

    if (kind === "work") {
        checkUnknownFields(record, new Set([
            "id", "status", "authorIds", "title", "shortTitle", "edition",
            "editor", "translator", "originalLanguage", "dateWritten",
            "disputedAuthorship", "publicationInfo", "locator",
            "publicDomainStatus", "verificationRecordIds", "notes",
        ]), issues, kind);
        checkEnum(record, "status", LIFECYCLE_STATUSES, issues, kind, { required: true });
        checkStringArray(record, "authorIds", issues, kind);
        checkString(record, "title", issues, kind, { allowNull: true });
        for (const field of ["shortTitle", "edition", "editor", "translator", "originalLanguage", "publicationInfo", "notes"]) {
            checkString(record, field, issues, kind, { allowNull: true });
        }
        const disputed = record.disputedAuthorship;
        if (disputed !== null && disputed !== undefined && typeof disputed !== "boolean") {
            issues.push(issue("error", kind, record.id, "wrong-type", `Field "disputedAuthorship" must be a boolean or null.`));
        }
        checkEnum(record, "publicDomainStatus", ["public-domain", "in-copyright", "unknown"], issues, kind, { allowNull: true });
        checkStringArray(record, "verificationRecordIds", issues, kind);
        checkDateObject(record.dateWritten, "dateWritten", issues, kind, record.id);
        const locator = record.locator;
        if (locator !== null && locator !== undefined) {
            if (!isPlainObject(locator)) {
                issues.push(issue("error", kind, record.id, "wrong-type", `Field "locator" must be an object or null.`));
            } else {
                const nested = { ...locator, id: record.id };
                checkString(nested, "printCitation", issues, kind, { allowNull: true });
                checkString(nested, "url", issues, kind, { allowNull: true });
            }
        }
    }

    if (kind === "interpretation") {
        checkUnknownFields(record, new Set([
            "id", "passageId", "authorId", "workId", "status", "quotation",
            "explanation", "historicalContext", "relationshipToDoctrine",
            "citation", "alternativeReadings", "verificationRecordIds", "notes",
        ]), issues, kind);
        checkString(record, "passageId", issues, kind, { required: true });
        checkString(record, "authorId", issues, kind, { required: true });
        checkString(record, "workId", issues, kind, { required: true });
        checkEnum(record, "status", LIFECYCLE_STATUSES, issues, kind, { required: true });
        for (const field of ["explanation", "historicalContext", "relationshipToDoctrine", "citation", "notes"]) {
            checkString(record, field, issues, kind, { allowNull: true });
        }
        checkStringArray(record, "verificationRecordIds", issues, kind);
        const quotation = record.quotation;
        if (quotation !== null && quotation !== undefined) {
            if (!isPlainObject(quotation)) {
                issues.push(issue("error", kind, record.id, "wrong-type", `Field "quotation" must be an object or null.`));
            } else {
                for (const field of ["text", "language", "translation", "edition", "location", "summary"]) {
                    if (quotation[field] === undefined) {
                        issues.push(issue("error", kind, record.id, "missing-field", `Missing required field "quotation.${field}".`));
                    } else if (quotation[field] !== null && typeof quotation[field] !== "string") {
                        issues.push(issue("error", kind, record.id, "wrong-type", `Field "quotation.${field}" must be a string or null.`));
                    }
                }
                checkEnum({ ...quotation, id: record.id }, "reproducibilityStatus", [...REPRODUCIBLE_STATUSES, "not-reproducible"], issues, kind, { allowNull: true });
            }
        }
        const alternatives = record.alternativeReadings;
        if (alternatives !== undefined) {
            if (!Array.isArray(alternatives)) {
                issues.push(issue("error", kind, record.id, "wrong-type", `Field "alternativeReadings" must be an array.`));
            } else {
                for (const entry of alternatives) {
                    if (!isPlainObject(entry) || !isNonEmptyString(entry.authorId) || !isNonEmptyString(entry.summary)) {
                        issues.push(issue("error", kind, record.id, "wrong-type", `Each "alternativeReadings" entry needs an "authorId" and a "summary".`));
                        break;
                    }
                }
            }
        }
    }

    if (kind === "verificationRecord") {
        checkUnknownFields(record, new Set([
            "id", "claimId", "claimText", "claimType", "sourcesChecked",
            "checker", "checkDate", "result", "evidenceFound",
            "editorialApproval", "limitations", "notes",
        ]), issues, kind);
        checkString(record, "claimId", issues, kind, { required: true });
        checkString(record, "claimText", issues, kind, { required: true });
        checkEnum(record, "claimType", CLAIM_TYPES, issues, kind, { required: true });
        checkString(record, "checker", issues, kind, { required: true });
        checkString(record, "evidenceFound", issues, kind, { required: true });
        checkEnum(record, "result", VERIFICATION_RESULTS, issues, kind, { required: true });
        if (record.checkDate === undefined) {
            issues.push(issue("error", kind, record.id, "missing-field", `Missing required field "checkDate".`));
        } else if (typeof record.checkDate !== "string" || !DATE_PATTERN.test(record.checkDate)) {
            issues.push(issue("error", kind, record.id, "invalid-date", `Field "checkDate" must be a YYYY-MM-DD date.`));
        }
        checkString(record, "limitations", issues, kind, { allowNull: true });
        checkString(record, "notes", issues, kind, { allowNull: true });
        const approval = record.editorialApproval;
        if (approval !== null && approval !== undefined) {
            if (!isPlainObject(approval)) {
                issues.push(issue("error", kind, record.id, "wrong-type", `Field "editorialApproval" must be an object or null.`));
            } else {
                const nested = { ...approval, id: record.id };
                checkString(nested, "approvedBy", issues, kind, { required: true });
                if (approval.date === undefined) {
                    issues.push(issue("error", kind, record.id, "missing-field", `Missing required field "editorialApproval.date".`));
                } else if (typeof approval.date !== "string" || !DATE_PATTERN.test(approval.date)) {
                    issues.push(issue("error", kind, record.id, "invalid-date", `Field "editorialApproval.date" must be a YYYY-MM-DD date.`));
                }
                checkString(nested, "note", issues, kind, { allowNull: true });
            }
        }
        const sources = record.sourcesChecked;
        if (sources === undefined) {
            issues.push(issue("error", kind, record.id, "missing-field", `Missing required field "sourcesChecked".`));
        } else if (!Array.isArray(sources) || sources.length < 1) {
            issues.push(issue("error", kind, record.id, "wrong-type", `Field "sourcesChecked" must be an array with at least one source.`));
        } else {
            for (const source of sources) {
                if (!isPlainObject(source) || !isNonEmptyString(source.source) || !isNonEmptyString(source.dateAccessed)) {
                    issues.push(issue("error", kind, record.id, "wrong-type", `Each "sourcesChecked" entry needs a "source" and a "dateAccessed".`));
                    break;
                }
            }
        }
    }

    return issues;
}

// The publishability gate (standards §8–§10). A record is publishable
// only when its own status is `editorially-approved` or `published`,
// it cites at least one verification record, and every cited record
// exists, is structurally valid, has result `verified`, and carries
// editorial approval. Anything else — including a `verified` record
// with no approval, and a claim with no verification record at all —
// is not publishable. The status is never upgraded: this only reads it.
export function isPublishable(record, verificationRecordsById) {
    if (!record || !PUBLISHABLE_STATUSES.includes(record.status)) return false;
    const ids = record.verificationRecordIds ?? [];
    if (!Array.isArray(ids) || ids.length === 0) return false;
    return ids.every((id) => {
        const verification = verificationRecordsById.get(id);
        return Boolean(verification)
            && verification.result === "verified"
            && verification.editorialApproval != null;
    });
}

// Display label for a passage reference: "Genesis 1:26" for a single
// verse, "John 1:1–3" for a range. The en dash matches the workspace.
export function buildPassageLabel({ book, chapter, verseStart, verseEnd }) {
    if (verseStart === verseEnd) return `${book} ${chapter}:${verseStart}`;
    return `${book} ${chapter}:${verseStart}–${verseEnd}`;
}

// Display label for a work's writing date, from the research
// `dateWritten` shape. Only a date whose certainty is exact,
// approximate, or range — with a year present — renders a year, and
// only AD years are rendered: the corpus is AD-only, so a non-positive
// year is treated as unverified rather than guessed at. Everything
// else renders the pending label, exactly like the workspace's
// `getWorkDateLabel` does for a pending work.
export function formatWorkDate(dateWritten) {
    if (!isPlainObject(dateWritten)) {
        return { status: "pending", label: DATE_PENDING_LABEL };
    }
    const { certainty, earliest, latest } = dateWritten;
    if (!isInteger(earliest) || earliest <= 0) {
        return { status: "pending", label: DATE_PENDING_LABEL };
    }
    if (certainty === "exact") {
        return { status: "verified", label: `AD ${earliest}`, certainty: "exact" };
    }
    if (certainty === "approximate") {
        return { status: "verified", label: `c. AD ${earliest}`, certainty: "approximate" };
    }
    if (certainty === "range" && isInteger(latest) && latest > 0) {
        return { status: "verified", label: `AD ${earliest}–${latest}`, certainty: "range" };
    }
    return { status: "pending", label: DATE_PENDING_LABEL };
}

// Render a source citation for an interpretation, from the trusted
// parts only. The research `citation` field wins verbatim when present
// — the adapter calls this only for publishable interpretations, so
// the field has already passed the §10 gate; never call it with a
// draft interpretation and present the result as verified.
// Otherwise the citation is composed from the author's display name,
// the work's title (already trust-adjusted to null when unverified),
// edition, translator, quotation location, and locator — only the
// parts that exist. Returns null when nothing citable exists, so the
// panel omits the `<cite>` instead of inventing one.
export function renderCitation(interpretation, work, author) {
    if (isNonEmptyString(interpretation?.citation)) {
        return interpretation.citation;
    }
    const parts = [];
    if (work?.title) parts.push(work.title);
    if (work?.edition) parts.push(work.edition);
    if (work?.translator) parts.push(`trans. ${work.translator}`);
    if (interpretation?.quotationLocation) parts.push(interpretation.quotationLocation);
    if (work?.locator?.printCitation) parts.push(work.locator.printCitation);
    if (work?.locator?.url) parts.push(work.locator.url);
    // A bare author name is not a citation: it is only included when
    // at least one citable part exists.
    if (parts.length === 0) return null;
    if (author?.name) parts.unshift(author.name);
    return parts.join(", ");
}

function asArray(value, field, kind, issues) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
        issues.push(issue("error", kind, null, "wrong-type", `Field "${field}" must be an array.`));
        return [];
    }
    return value;
}

// Index valid records by id. The first record wins on a duplicate id;
// later duplicates are excluded with an issue — a duplicate id is a
// data error, and silently overwriting would hide it.
function indexValid(records, kind, issues, excluded) {
    const byId = new Map();
    for (const record of records) {
        const recordIssues = validateRecord(kind, record);
        issues.push(...recordIssues);
        if (recordIssues.some((entry) => entry.severity === "error")) {
            excluded.push({ kind, id: record?.id ?? null, reason: "invalid-record" });
            continue;
        }
        if (byId.has(record.id)) {
            issues.push(issue("error", kind, record.id, "duplicate-id", `Duplicate ${kind} id "${record.id}": the first record wins.`));
            excluded.push({ kind, id: record.id, reason: "duplicate-id" });
            continue;
        }
        byId.set(record.id, record);
    }
    return byId;
}

// Adapt a research bundle into the workspace's UI shapes.
//
// Input — every array optional (a missing file just means no records
// of that kind yet; today there is no interpretations file at all):
//   { doctrine?, passages?, authors?, works?, interpretations?,
//     verificationRecords? }
//
// Output:
//   { doctrine,
//     published: { passages, figures, works, interpretations,
//                  passageInterpretations },
//     excluded: [{ kind, id, reason }],
//     issues: [{ severity, kind, id, code, message }] }
//
// `published` contains only records that pass the §10 gate, in the
// exact shapes `./doctrineStudies.js` defines (plus `researchStatus`,
// `quotationSummary`, and `canonicalOrder` metadata the future wiring
// needs). Everything else lands in `excluded` with a reason, and every
// problem lands in `issues`. A null or non-object bundle yields empty
// output and one issue — never a crash.
export function adaptResearchData(bundle = {}, options = {}) {
    const issues = [];
    const excluded = [];
    if (!isPlainObject(bundle)) {
        issues.push(issue("error", "bundle", null, "not-an-object", "Research bundle must be an object."));
        return { doctrine: "trinity", published: emptyPublished(), excluded, issues };
    }
    const doctrine = options.doctrine ?? bundle.doctrine ?? "trinity";
    if (!DOCTRINES.includes(doctrine)) {
        issues.push(issue("error", "bundle", null, "invalid-enum", `Unknown doctrine ${JSON.stringify(doctrine)}.`));
        return { doctrine, published: emptyPublished(), excluded, issues };
    }

    const verificationRecordsById = indexValid(
        asArray(bundle.verificationRecords, "verificationRecords", "verificationRecord", issues),
        "verificationRecord", issues, excluded,
    );
    const passagesById = indexValid(
        asArray(bundle.passages, "passages", "passage", issues), "passage", issues, excluded,
    );
    const authorsById = indexValid(
        asArray(bundle.authors, "authors", "author", issues), "author", issues, excluded,
    );
    const worksById = indexValid(
        asArray(bundle.works, "works", "work", issues), "work", issues, excluded,
    );
    const interpretationsById = indexValid(
        asArray(bundle.interpretations, "interpretations", "interpretation", issues), "interpretation", issues, excluded,
    );

    // Cross-reference checks. A dangling passage or author reference
    // excludes the interpretation: the panel cannot render a theologian
    // it cannot name, or an entry for a passage that does not exist. A
    // dangling work reference does not exclude it — the panel already
    // renders a missing work as pending title and date.
    for (const interpretation of interpretationsById.values()) {
        if (!passagesById.has(interpretation.passageId)) {
            issues.push(issue("error", "interpretation", interpretation.id, "dangling-reference", `Passage "${interpretation.passageId}" does not exist.`));
            excluded.push({ kind: "interpretation", id: interpretation.id, reason: "dangling-passage" });
            interpretationsById.delete(interpretation.id);
        } else if (!authorsById.has(interpretation.authorId)) {
            issues.push(issue("error", "interpretation", interpretation.id, "dangling-reference", `Author "${interpretation.authorId}" does not exist.`));
            excluded.push({ kind: "interpretation", id: interpretation.id, reason: "dangling-author" });
            interpretationsById.delete(interpretation.id);
        } else if (!worksById.has(interpretation.workId)) {
            issues.push(issue("warning", "interpretation", interpretation.id, "dangling-reference", `Work "${interpretation.workId}" does not exist; the title and date render as pending.`));
        }
        for (const recordId of interpretation.verificationRecordIds ?? []) {
            if (!verificationRecordsById.has(recordId)) {
                issues.push(issue("error", "interpretation", interpretation.id, "dangling-reference", `Verification record "${recordId}" does not exist; the interpretation cannot be publishable.`));
            }
        }
    }
    for (const passage of passagesById.values()) {
        for (const ref of passage.crossReferences ?? []) {
            if (!passagesById.has(ref.passageId)) {
                issues.push(issue("warning", "passage", passage.id, "dangling-reference", `Cross-reference to passage "${ref.passageId}" does not exist and is dropped.`));
            }
        }
        for (const recordId of passage.verificationRecordIds ?? []) {
            if (!verificationRecordsById.has(recordId)) {
                issues.push(issue("error", "passage", passage.id, "dangling-reference", `Verification record "${recordId}" does not exist; the passage cannot be publishable.`));
            }
        }
    }
    for (const work of worksById.values()) {
        for (const authorId of work.authorIds ?? []) {
            if (!authorsById.has(authorId)) {
                issues.push(issue("warning", "work", work.id, "dangling-reference", `Author "${authorId}" does not exist and is dropped from the work's authors.`));
            }
        }
    }

    // Figures: every structurally valid author. A registry stub asserts
    // only its id, display name, and status, so the name is trusted as
    // an identifier; the passage-to-author link is gated separately by
    // the interpretation's own publishability.
    const figures = [...authorsById.values()].map((author) => ({
        id: author.id,
        name: author.displayName,
        researchStatus: author.status,
    }));

    // Works: every structurally valid work, with the title and writing
    // date trust-adjusted — trusted only under the §10 gate, otherwise
    // null / pending, exactly as the workspace's pending labels expect.
    // `figureId` is the first resolvable author, or null when none
    // resolves (the panel then renders the pending labels).
    const works = [...worksById.values()].map((work) => {
        const trusted = isPublishable(work, verificationRecordsById);
        const figureId = (work.authorIds ?? []).find((authorId) => authorsById.has(authorId)) ?? null;
        return {
            id: work.id,
            figureId,
            title: trusted ? work.title ?? null : null,
            date: trusted ? formatWorkDate(work.dateWritten) : { status: "pending", label: DATE_PENDING_LABEL },
            edition: trusted ? work.edition ?? null : null,
            translator: trusted ? work.translator ?? null : null,
            locator: trusted ? work.locator ?? null : null,
            researchStatus: work.status,
        };
    });
    const worksByIdMapped = new Map(works.map((work) => [work.id, work]));
    const figuresById = new Map(figures.map((figure) => [figure.id, figure]));

    // Passages: publishable ones only, in canonical order
    // (Genesis→Revelation, then chapter, then verse). A passage whose
    // doctrine does not match the requested one is excluded, never
    // silently mixed in.
    const publishedPassages = [...passagesById.values()]
        .filter((passage) => {
            if (passage.doctrine !== doctrine) {
                issues.push(issue("warning", "passage", passage.id, "wrong-doctrine", `Passage belongs to doctrine "${passage.doctrine}", not "${doctrine}", and is excluded.`));
                excluded.push({ kind: "passage", id: passage.id, reason: "wrong-doctrine" });
                return false;
            }
            if (!isPublishable(passage, verificationRecordsById)) {
                excluded.push({ kind: "passage", id: passage.id, reason: "not-publishable" });
                return false;
            }
            return true;
        })
        .sort((a, b) =>
            a.canonicalOrder - b.canonicalOrder
            || a.chapter - b.chapter
            || a.verseStart - b.verseStart
            || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
        )
        .map((passage) => ({
            id: passage.id,
            book: passage.book,
            startChapter: passage.chapter,
            startVerse: passage.verseStart,
            endChapter: passage.chapter,
            endVerse: passage.verseEnd,
            label: buildPassageLabel(passage),
            canonicalOrder: passage.canonicalOrder,
            researchStatus: passage.status,
        }));
    const publishedPassageIds = new Set(publishedPassages.map((passage) => passage.id));

    // Interpretations: publishable ones only, for published passages
    // only. Within a passage they are ordered by trusted writing date
    // (earliest first; pending dates last), then author, work, and id —
    // a deterministic display order that asserts no chronology for
    // pending dates. The quotation text passes through only when its
    // reproducibility status allows it; a `not-reproducible` quotation
    // becomes a summary, never quoted text.
    const publishedInterpretations = [];
    const passageInterpretations = {};
    for (const passage of publishedPassages) {
        passageInterpretations[passage.id] = [];
    }
    const byPassage = new Map();
    for (const interpretation of interpretationsById.values()) {
        if (!publishedPassageIds.has(interpretation.passageId)) {
            excluded.push({ kind: "interpretation", id: interpretation.id, reason: "passage-not-published" });
            continue;
        }
        if (!isPublishable(interpretation, verificationRecordsById)) {
            excluded.push({ kind: "interpretation", id: interpretation.id, reason: "not-publishable" });
            continue;
        }
        const work = worksByIdMapped.get(interpretation.workId) ?? null;
        const figure = figuresById.get(interpretation.authorId) ?? null;
        const quotation = interpretation.quotation;
        let quotationText = null;
        let quotationSummary = null;
        if (quotation) {
            if (quotation.reproducibilityStatus === "not-reproducible") {
                quotationSummary = quotation.summary ?? null;
            } else if (REPRODUCIBLE_STATUSES.includes(quotation.reproducibilityStatus)) {
                quotationText = quotation.text ?? null;
                quotationSummary = quotation.summary ?? null;
            }
            // Any other reproducibility status (including null) is
            // untrusted: the text stays null rather than guessed at.
        }
        const mapped = {
            id: interpretation.id,
            figureId: interpretation.authorId,
            workId: interpretation.workId,
            passageId: interpretation.passageId,
            quotation: quotationText,
            quotationSummary,
            quotationLocation: quotation?.location ?? null,
            explanation: interpretation.explanation ?? null,
            citation: renderCitation(
                { ...interpretation, quotationLocation: quotation?.location ?? null },
                work,
                figure,
            ),
            placeholder: false,
            demonstration: false,
            researchStatus: interpretation.status,
            order: 0,
        };
        if (!byPassage.has(interpretation.passageId)) byPassage.set(interpretation.passageId, []);
        byPassage.get(interpretation.passageId).push({ mapped, interpretation });
    }
    // The trusted writing year of a work, for ordering interpretations
    // within a passage: only a year from a work that passes the §10
    // gate counts. Anything else is null and sorts last — ordering by
    // an unverified date would assert chronology the research does
    // not support.
    function trustedWorkEarliest(workId) {
        const raw = worksById.get(workId);
        if (!raw || !isPublishable(raw, verificationRecordsById)) return null;
        const earliest = raw.dateWritten?.earliest;
        return isInteger(earliest) && earliest > 0 ? earliest : null;
    }

    for (const [passageId, entries] of byPassage) {
        entries
            .sort((a, b) => {
                const dateA = trustedWorkEarliest(a.interpretation.workId);
                const dateB = trustedWorkEarliest(b.interpretation.workId);
                return (dateA ?? Infinity) - (dateB ?? Infinity)
                    || (a.interpretation.authorId < b.interpretation.authorId ? -1 : a.interpretation.authorId > b.interpretation.authorId ? 1 : 0)
                    || (a.interpretation.workId < b.interpretation.workId ? -1 : a.interpretation.workId > b.interpretation.workId ? 1 : 0)
                    || (a.interpretation.id < b.interpretation.id ? -1 : a.interpretation.id > b.interpretation.id ? 1 : 0);
            })
            .forEach((entry, index) => {
                entry.mapped.order = index;
                publishedInterpretations.push(entry.mapped);
                passageInterpretations[passageId].push(entry.mapped.id);
            });
    }

    return {
        doctrine,
        published: {
            passages: publishedPassages,
            figures,
            works,
            interpretations: publishedInterpretations,
            passageInterpretations,
        },
        excluded,
        issues,
    };
}

function emptyPublished() {
    return { passages: [], figures: [], works: [], interpretations: [], passageInterpretations: {} };
}
