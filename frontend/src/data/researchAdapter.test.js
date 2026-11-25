// Tests for the Trace the Doctrine research-data adapter.
//
// Every fixture here is SYNTHETIC — written for testing only, clearly
// labelled as such, and never presented as verified historical
// evidence. No fixture asserts a real quotation, title, date, or
// passage-to-author link: the theologians named are historical
// figures, but every quotation, title, date, and citation attached to
// them in these fixtures is invented test data, and the tests pin the
// adapter's honesty rules around it — above all, that nothing draft
// is ever exposed as published and no status is ever upgraded.
import { describe, expect, it } from "vitest";
import {
    DATE_PENDING_LABEL,
} from "./doctrineStudies";
import {
    adaptResearchData,
    buildPassageLabel,
    formatWorkDate,
    isPublishable,
    renderCitation,
    validateRecord,
} from "./researchAdapter";

// -- Synthetic fixtures -------------------------------------------------

function verificationRecord(overrides = {}) {
    return {
        id: "ver-gen-1-26-001",
        claimId: "gen-1-26-claim",
        claimText: "Synthetic claim text for testing only.",
        claimType: "passage-link",
        sourcesChecked: [{ source: "Synthetic source for testing only.", dateAccessed: "2026-11-24" }],
        checker: "synthetic-checker",
        checkDate: "2026-11-24",
        result: "verified",
        evidenceFound: "Synthetic evidence for testing only.",
        editorialApproval: { approvedBy: "Yonatan", date: "2026-11-24", note: null },
        limitations: null,
        notes: null,
        ...overrides,
    };
}

function passageRecord(overrides = {}) {
    return {
        id: "gen-1-26",
        doctrine: "trinity",
        book: "Genesis",
        chapter: 1,
        verseStart: 26,
        verseEnd: 26,
        canonicalOrder: 1,
        status: "editorially-approved",
        evidenceClassification: "indirect",
        relationshipToDoctrine: { text: "Synthetic relationship for testing only.", status: "editorially-approved" },
        crossReferences: [],
        interpretiveQuestions: [],
        verificationRecordIds: ["ver-gen-1-26-001"],
        notes: null,
        ...overrides,
    };
}

function authorRecord(overrides = {}) {
    return {
        id: "justin-martyr",
        displayName: "Justin Martyr",
        // A registry stub: it asserts only id, display name, and status.
        status: "not-started",
        bio: null,
        dates: null,
        verificationRecordIds: [],
        notes: null,
        ...overrides,
    };
}

function workRecord(overrides = {}) {
    return {
        id: "justin-martyr-first-apology",
        status: "editorially-approved",
        authorIds: ["justin-martyr"],
        title: "First Apology",
        shortTitle: null,
        edition: "ANF 1",
        editor: null,
        translator: "Roberts and Donaldson",
        originalLanguage: "Greek",
        dateWritten: { certainty: "approximate", earliest: 155, latest: null, note: null },
        disputedAuthorship: false,
        publicationInfo: null,
        locator: { printCitation: null, url: "https://example.test/first-apology" },
        publicDomainStatus: "public-domain",
        verificationRecordIds: ["ver-work-justin-001"],
        notes: null,
        ...overrides,
    };
}

function interpretationRecord(overrides = {}) {
    return {
        id: "justin-martyr-gen-1-26-001",
        passageId: "gen-1-26",
        authorId: "justin-martyr",
        workId: "justin-martyr-first-apology",
        status: "editorially-approved",
        quotation: {
            text: "Synthetic quotation text for testing only.",
            language: "English",
            translation: "Roberts-Donaldson",
            edition: "ANF 1",
            location: "ch. 13",
            reproducibilityStatus: "public-domain",
            summary: null,
        },
        explanation: "Synthetic explanation for testing only.",
        historicalContext: null,
        relationshipToDoctrine: "Synthetic relationship for testing only.",
        citation: null,
        alternativeReadings: [],
        verificationRecordIds: ["ver-interp-justin-001"],
        notes: null,
        ...overrides,
    };
}

// A complete, publishable bundle: one passage, one author, one work,
// one interpretation, and the three verification records that make
// each of them publishable.
function publishableBundle() {
    return {
        doctrine: "trinity",
        passages: [passageRecord()],
        authors: [authorRecord()],
        works: [workRecord()],
        interpretations: [interpretationRecord()],
        verificationRecords: [
            verificationRecord(),
            verificationRecord({ id: "ver-work-justin-001", claimId: "work-title-claim", claimType: "attribution" }),
            verificationRecord({ id: "ver-interp-justin-001", claimId: "interp-claim", claimType: "quotation" }),
        ],
    };
}

describe("researchAdapter passage labels and work dates", () => {
    it("builds a single-verse label and a range label", () => {
        expect(buildPassageLabel({ book: "Genesis", chapter: 1, verseStart: 26, verseEnd: 26 })).toBe("Genesis 1:26");
        expect(buildPassageLabel({ book: "John", chapter: 1, verseStart: 1, verseEnd: 3 })).toBe("John 1:1–3");
        expect(buildPassageLabel({ book: "Matthew", chapter: 28, verseStart: 19, verseEnd: 19 })).toBe("Matthew 28:19");
    });

    it("formats verified work dates and never invents a year for the rest", () => {
        expect(formatWorkDate({ certainty: "exact", earliest: 180, latest: null, note: null })).toEqual({
            status: "verified", label: "AD 180", certainty: "exact",
        });
        expect(formatWorkDate({ certainty: "approximate", earliest: 155, latest: null, note: null })).toEqual({
            status: "verified", label: "c. AD 155", certainty: "approximate",
        });
        expect(formatWorkDate({ certainty: "range", earliest: 150, latest: 160, note: null })).toEqual({
            status: "verified", label: "AD 150–160", certainty: "range",
        });
        // Unknown certainty, no year, no date at all, and a non-positive
        // year all render the pending label — never a guessed year.
        for (const dateWritten of [
            { certainty: "unknown", earliest: 155, latest: null, note: null },
            { certainty: "exact", earliest: null, latest: null, note: null },
            { certainty: "range", earliest: 150, latest: null, note: null },
            { certainty: "exact", earliest: -50, latest: null, note: null },
            null,
            undefined,
        ]) {
            expect(formatWorkDate(dateWritten)).toEqual({ status: "pending", label: DATE_PENDING_LABEL });
        }
    });
});

describe("researchAdapter citation rendering", () => {
    it("uses the research citation verbatim when present", () => {
        const interpretation = { citation: "Justin Martyr, First Apology (ANF 1)." };
        expect(renderCitation(interpretation, null, null)).toBe("Justin Martyr, First Apology (ANF 1).");
    });

    it("composes a citation from the trusted parts when no citation field exists", () => {
        const interpretation = { citation: null, quotationLocation: "ch. 13" };
        const work = {
            title: "First Apology",
            edition: "ANF 1",
            translator: "Roberts and Donaldson",
            locator: { printCitation: null, url: "https://example.test/first-apology" },
        };
        const author = { name: "Justin Martyr" };
        expect(renderCitation(interpretation, work, author)).toBe(
            "Justin Martyr, First Apology, ANF 1, trans. Roberts and Donaldson, ch. 13, https://example.test/first-apology",
        );
    });

    it("returns null when nothing citable exists instead of inventing one", () => {
        expect(renderCitation({ citation: null }, { title: null, edition: null, translator: null, locator: null }, null)).toBeNull();
        expect(renderCitation({}, null, null)).toBeNull();
    });
});

describe("researchAdapter publishability gate", () => {
    it("publishes a record only when verified AND editorially approved", () => {
        const records = new Map([
            ["ver-ok", verificationRecord({ id: "ver-ok" })],
            ["ver-partial", verificationRecord({ id: "ver-partial", result: "partially-verified", editorialApproval: null })],
            ["ver-unapproved", verificationRecord({ id: "ver-unapproved", editorialApproval: null })],
        ]);
        expect(isPublishable({ status: "editorially-approved", verificationRecordIds: ["ver-ok"] }, records)).toBe(true);
        expect(isPublishable({ status: "published", verificationRecordIds: ["ver-ok"] }, records)).toBe(true);
        // Verified but not approved: never publishable.
        expect(isPublishable({ status: "verified", verificationRecordIds: ["ver-ok"] }, records)).toBe(false);
        expect(isPublishable({ status: "editorially-approved", verificationRecordIds: ["ver-unapproved"] }, records)).toBe(false);
        // Partially-verified: never publishable.
        expect(isPublishable({ status: "editorially-approved", verificationRecordIds: ["ver-partial"] }, records)).toBe(false);
        // No verification records at all: never publishable.
        expect(isPublishable({ status: "editorially-approved", verificationRecordIds: [] }, records)).toBe(false);
        expect(isPublishable({ status: "editorially-approved" }, records)).toBe(false);
        // A cited record that does not exist: never publishable.
        expect(isPublishable({ status: "editorially-approved", verificationRecordIds: ["ver-missing"] }, records)).toBe(false);
        // Draft statuses are never publishable, whatever the records say.
        for (const status of ["not-started", "in-research", "verification-pending"]) {
            expect(isPublishable({ status, verificationRecordIds: ["ver-ok"] }, records)).toBe(false);
        }
    });
});

describe("researchAdapter mapping", () => {
    it("maps a publishable bundle to the workspace shapes", () => {
        const result = adaptResearchData(publishableBundle());
        expect(result.issues).toEqual([]);
        expect(result.excluded).toEqual([]);
        expect(result.doctrine).toBe("trinity");

        expect(result.published.passages).toEqual([
            {
                id: "gen-1-26",
                book: "Genesis",
                startChapter: 1,
                startVerse: 26,
                endChapter: 1,
                endVerse: 26,
                label: "Genesis 1:26",
                canonicalOrder: 1,
                researchStatus: "editorially-approved",
            },
        ]);
        expect(result.published.figures).toEqual([
            { id: "justin-martyr", name: "Justin Martyr", researchStatus: "not-started" },
        ]);
        expect(result.published.works).toEqual([
            {
                id: "justin-martyr-first-apology",
                figureId: "justin-martyr",
                title: "First Apology",
                date: { status: "verified", label: "c. AD 155", certainty: "approximate" },
                edition: "ANF 1",
                translator: "Roberts and Donaldson",
                locator: { printCitation: null, url: "https://example.test/first-apology" },
                researchStatus: "editorially-approved",
            },
        ]);
        expect(result.published.interpretations).toHaveLength(1);
        const interpretation = result.published.interpretations[0];
        expect(interpretation.id).toBe("justin-martyr-gen-1-26-001");
        expect(interpretation.figureId).toBe("justin-martyr");
        expect(interpretation.workId).toBe("justin-martyr-first-apology");
        expect(interpretation.passageId).toBe("gen-1-26");
        expect(interpretation.quotation).toBe("Synthetic quotation text for testing only.");
        expect(interpretation.quotationSummary).toBeNull();
        expect(interpretation.explanation).toBe("Synthetic explanation for testing only.");
        expect(interpretation.citation).toBe(
            "Justin Martyr, First Apology, ANF 1, trans. Roberts and Donaldson, ch. 13, https://example.test/first-apology",
        );
        expect(interpretation.placeholder).toBe(false);
        expect(interpretation.demonstration).toBe(false);
        expect(interpretation.researchStatus).toBe("editorially-approved");
        expect(interpretation.order).toBe(0);
        expect(result.published.passageInterpretations).toEqual({ "gen-1-26": ["justin-martyr-gen-1-26-001"] });
    });

    it("sorts passages by canonical order, then chapter, then verse", () => {
        const bundle = publishableBundle();
        bundle.passages = [
            passageRecord({ id: "john-1-1", book: "John", chapter: 1, verseStart: 1, verseEnd: 3, canonicalOrder: 43, verificationRecordIds: ["ver-john-001"] }),
            passageRecord({ id: "matt-28-19", book: "Matthew", chapter: 28, verseStart: 19, verseEnd: 19, canonicalOrder: 40, verificationRecordIds: ["ver-matt-001"] }),
            passageRecord(),
        ];
        bundle.verificationRecords.push(
            verificationRecord({ id: "ver-john-001", claimId: "john-claim" }),
            verificationRecord({ id: "ver-matt-001", claimId: "matt-claim" }),
        );
        const result = adaptResearchData(bundle);
        expect(result.published.passages.map((passage) => passage.id)).toEqual(["gen-1-26", "matt-28-19", "john-1-1"]);
        expect(result.published.passages.map((passage) => passage.label)).toEqual([
            "Genesis 1:26",
            "Matthew 28:19",
            "John 1:1–3",
        ]);
    });

    it("orders a passage's interpretations by trusted writing date, pending dates last", () => {
        const bundle = publishableBundle();
        bundle.authors.push(
            authorRecord({ id: "irenaeus", displayName: "Irenaeus" }),
            authorRecord({ id: "tertullian", displayName: "Tertullian" }),
        );
        bundle.works.push(
            workRecord({
                id: "irenaeus-against-heresies",
                authorIds: ["irenaeus"],
                title: "Against Heresies",
                dateWritten: { certainty: "approximate", earliest: 180, latest: null, note: null },
                verificationRecordIds: ["ver-work-irenaeus-001"],
            }),
            workRecord({
                id: "tertullian-against-praxeas",
                authorIds: ["tertullian"],
                title: "Against Praxeas",
                dateWritten: null,
                verificationRecordIds: ["ver-work-tertullian-001"],
            }),
        );
        bundle.interpretations.push(
            interpretationRecord({
                id: "irenaeus-gen-1-26-001",
                authorId: "irenaeus",
                workId: "irenaeus-against-heresies",
                verificationRecordIds: ["ver-interp-irenaeus-001"],
            }),
            interpretationRecord({
                id: "tertullian-gen-1-26-001",
                authorId: "tertullian",
                workId: "tertullian-against-praxeas",
                verificationRecordIds: ["ver-interp-tertullian-001"],
            }),
        );
        bundle.verificationRecords.push(
            verificationRecord({ id: "ver-work-irenaeus-001", claimId: "work-irenaeus-claim", claimType: "attribution" }),
            verificationRecord({ id: "ver-work-tertullian-001", claimId: "work-tertullian-claim", claimType: "attribution" }),
            verificationRecord({ id: "ver-interp-irenaeus-001", claimId: "interp-irenaeus-claim", claimType: "quotation" }),
            verificationRecord({ id: "ver-interp-tertullian-001", claimId: "interp-tertullian-claim", claimType: "quotation" }),
        );
        const result = adaptResearchData(bundle);
        expect(result.issues).toEqual([]);
        // Justin (c. AD 155) first, Irenaeus (c. AD 180) second, and the
        // pending-date work last — never ordered by an unverified date.
        expect(result.published.interpretations.map((entry) => entry.id)).toEqual([
            "justin-martyr-gen-1-26-001",
            "irenaeus-gen-1-26-001",
            "tertullian-gen-1-26-001",
        ]);
        expect(result.published.interpretations.map((entry) => entry.order)).toEqual([0, 1, 2]);
    });
});

describe("researchAdapter fallbacks for incomplete and missing data", () => {
    it("renders null titles, dates, and quotations as pending, never as facts", () => {
        const bundle = publishableBundle();
        bundle.works = [
            workRecord({
                title: null,
                dateWritten: null,
                edition: null,
                translator: null,
                locator: null,
            }),
        ];
        bundle.interpretations = [
            interpretationRecord({
                quotation: null,
                explanation: null,
                citation: null,
            }),
        ];
        const result = adaptResearchData(bundle);
        expect(result.issues).toEqual([]);
        expect(result.published.works[0].title).toBeNull();
        expect(result.published.works[0].date).toEqual({ status: "pending", label: DATE_PENDING_LABEL });
        expect(result.published.works[0].edition).toBeNull();
        const interpretation = result.published.interpretations[0];
        expect(interpretation.quotation).toBeNull();
        expect(interpretation.explanation).toBeNull();
        expect(interpretation.citation).toBeNull();
        expect(interpretation.quotationSummary).toBeNull();
    });

    it("never trusts a title or date from a work that is not itself publishable", () => {
        const bundle = publishableBundle();
        bundle.works = [
            workRecord({
                status: "in-research",
                title: "First Apology",
                dateWritten: { certainty: "exact", earliest: 155, latest: null, note: null },
                verificationRecordIds: [],
            }),
        ];
        const result = adaptResearchData(bundle);
        // The interpretation is still publishable on its own gate, but
        // its work's title and date render as pending.
        expect(result.published.interpretations).toHaveLength(1);
        expect(result.published.works[0].title).toBeNull();
        expect(result.published.works[0].date).toEqual({ status: "pending", label: DATE_PENDING_LABEL });
        expect(result.published.works[0].researchStatus).toBe("in-research");
    });

    it("keeps a quotation summary as prose, never as quoted text, when not reproducible", () => {
        const bundle = publishableBundle();
        bundle.interpretations = [
            interpretationRecord({
                quotation: {
                    text: null,
                    language: "Latin",
                    translation: null,
                    edition: "Synthetic edition for testing only.",
                    location: "ch. 2",
                    reproducibilityStatus: "not-reproducible",
                    summary: "Synthetic summary of the passage for testing only.",
                },
            }),
        ];
        const result = adaptResearchData(bundle);
        const interpretation = result.published.interpretations[0];
        expect(interpretation.quotation).toBeNull();
        expect(interpretation.quotationSummary).toBe("Synthetic summary of the passage for testing only.");
    });

    it("drops quotation text whose reproducibility status is untrusted", () => {
        const bundle = publishableBundle();
        bundle.interpretations = [
            interpretationRecord({
                quotation: {
                    text: "Synthetic quotation text for testing only.",
                    language: "English",
                    translation: null,
                    edition: null,
                    location: null,
                    reproducibilityStatus: null,
                    summary: null,
                },
            }),
        ];
        const result = adaptResearchData(bundle);
        expect(result.published.interpretations[0].quotation).toBeNull();
        expect(result.published.interpretations[0].quotationSummary).toBeNull();
    });

    it("returns an honest empty view for missing data instead of crashing", () => {
        expect(adaptResearchData({})).toEqual({
            doctrine: "trinity",
            published: { passages: [], figures: [], works: [], interpretations: [], passageInterpretations: {} },
            excluded: [],
            issues: [],
        });
        expect(adaptResearchData({ doctrine: "trinity", passages: [], authors: [], works: [], interpretations: [], verificationRecords: [] }).published.passages).toEqual([]);
        const nullBundle = adaptResearchData(null);
        expect(nullBundle.published.passages).toEqual([]);
        expect(nullBundle.issues).toHaveLength(1);
        expect(nullBundle.issues[0].code).toBe("not-an-object");
        const badBundle = adaptResearchData("not a bundle");
        expect(badBundle.published.passages).toEqual([]);
        expect(badBundle.issues).toHaveLength(1);
    });

    it("excludes a verification-pending passage and reports it, never publishing it", () => {
        const bundle = publishableBundle();
        bundle.passages = [passageRecord({ status: "verification-pending" })];
        const result = adaptResearchData(bundle);
        expect(result.published.passages).toEqual([]);
        expect(result.published.passageInterpretations).toEqual({});
        expect(result.published.interpretations).toEqual([]);
        expect(result.excluded).toContainEqual({ kind: "passage", id: "gen-1-26", reason: "not-publishable" });
        // The interpretation is excluded too: its passage is not published.
        expect(result.excluded).toContainEqual({ kind: "interpretation", id: "justin-martyr-gen-1-26-001", reason: "passage-not-published" });
        // Exclusion is not a validation failure: the records are valid,
        // just not publishable — so no issues are raised.
        expect(result.issues).toEqual([]);
    });
});

describe("researchAdapter validation", () => {
    it("excludes structurally invalid records with error issues", () => {
        expect(validateRecord("passage", { id: "Bad ID!", doctrine: "trinity" }).map((entry) => entry.code)).toContain("invalid-id");
        expect(validateRecord("passage", passageRecord({ book: undefined })).map((entry) => entry.code)).toContain("missing-field");
        expect(validateRecord("passage", passageRecord({ status: "almost-done" })).map((entry) => entry.code)).toContain("invalid-enum");
        expect(validateRecord("passage", passageRecord({ verseStart: 26, verseEnd: 25 })).map((entry) => entry.code)).toContain("invalid-range");
        expect(validateRecord("passage", passageRecord({ canonicalOrder: 67 })).map((entry) => entry.code)).toContain("out-of-range");
        expect(validateRecord("interpretation", interpretationRecord({ quotation: { text: "x" } })).map((entry) => entry.code)).toContain("missing-field");
        expect(validateRecord("verificationRecord", verificationRecord({ checkDate: "24 Nov 2026" })).map((entry) => entry.code)).toContain("invalid-date");
        expect(validateRecord("verificationRecord", verificationRecord({ sourcesChecked: [] })).map((entry) => entry.code)).toContain("wrong-type");
        expect(validateRecord("passage", "not an object").map((entry) => entry.code)).toContain("not-an-object");
    });

    it("warns on unknown fields but keeps the record", () => {
        const issues = validateRecord("passage", passageRecord({ surpriseField: "synthetic extra field" }));
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({ severity: "warning", code: "unknown-field" });
        const result = adaptResearchData({ ...publishableBundle(), passages: [passageRecord({ surpriseField: "synthetic extra field" })] });
        expect(result.published.passages).toHaveLength(1);
        expect(result.issues).toHaveLength(1);
    });

    it("excludes an invalid passage and its interpretations", () => {
        const bundle = publishableBundle();
        bundle.passages = [passageRecord({ status: "almost-done" })];
        const result = adaptResearchData(bundle);
        expect(result.published.passages).toEqual([]);
        expect(result.excluded).toContainEqual({ kind: "passage", id: "gen-1-26", reason: "invalid-record" });
        expect(result.excluded).toContainEqual({ kind: "interpretation", id: "justin-martyr-gen-1-26-001", reason: "dangling-passage" });
    });

    it("keeps the first record on a duplicate id and excludes the rest", () => {
        const bundle = publishableBundle();
        bundle.authors = [authorRecord(), authorRecord({ displayName: "Second Justin Martyr" })];
        const result = adaptResearchData(bundle);
        expect(result.published.figures).toEqual([
            { id: "justin-martyr", name: "Justin Martyr", researchStatus: "not-started" },
        ]);
        expect(result.issues.some((entry) => entry.code === "duplicate-id")).toBe(true);
        expect(result.excluded).toContainEqual({ kind: "author", id: "justin-martyr", reason: "duplicate-id" });
    });

    it("excludes interpretations with dangling passage or author references", () => {
        const bundle = publishableBundle();
        bundle.interpretations = [
            interpretationRecord({ id: "dangling-passage-001", passageId: "no-such-passage" }),
            interpretationRecord({ id: "dangling-author-001", authorId: "no-such-author" }),
        ];
        const result = adaptResearchData(bundle);
        expect(result.published.interpretations).toEqual([]);
        expect(result.excluded).toContainEqual({ kind: "interpretation", id: "dangling-passage-001", reason: "dangling-passage" });
        expect(result.excluded).toContainEqual({ kind: "interpretation", id: "dangling-author-001", reason: "dangling-author" });
    });

    it("keeps an interpretation with a dangling work reference, pending title and date", () => {
        const bundle = publishableBundle();
        bundle.interpretations = [interpretationRecord({ workId: "no-such-work" })];
        const result = adaptResearchData(bundle);
        expect(result.published.interpretations).toHaveLength(1);
        expect(result.published.interpretations[0].workId).toBe("no-such-work");
        expect(result.issues.some((entry) => entry.severity === "warning" && entry.code === "dangling-reference")).toBe(true);
    });

    it("excludes a passage from the wrong doctrine", () => {
        const bundle = publishableBundle();
        bundle.passages = [passageRecord({ id: "john-1-1", doctrine: "incarnation", book: "John", chapter: 1, verseStart: 1, verseEnd: 1, canonicalOrder: 43 })];
        const result = adaptResearchData(bundle);
        expect(result.published.passages).toEqual([]);
        expect(result.excluded).toContainEqual({ kind: "passage", id: "john-1-1", reason: "wrong-doctrine" });
    });

    it("never upgrades a verified-but-unapproved interpretation", () => {
        const bundle = publishableBundle();
        bundle.interpretations = [interpretationRecord({ status: "verified" })];
        const result = adaptResearchData(bundle);
        expect(result.published.interpretations).toEqual([]);
        expect(result.excluded).toContainEqual({ kind: "interpretation", id: "justin-martyr-gen-1-26-001", reason: "not-publishable" });
        expect(result.published.works[0].title).toBe("First Apology");
    });

    it("never publishes an interpretation with no verification records", () => {
        const bundle = publishableBundle();
        bundle.interpretations = [interpretationRecord({ verificationRecordIds: [] })];
        const result = adaptResearchData(bundle);
        expect(result.published.interpretations).toEqual([]);
        expect(result.excluded).toContainEqual({ kind: "interpretation", id: "justin-martyr-gen-1-26-001", reason: "not-publishable" });
    });

    it("never publishes an interpretation citing a partially-verified record", () => {
        const bundle = publishableBundle();
        bundle.verificationRecords.push(
            verificationRecord({ id: "ver-partial-001", claimId: "partial-claim", result: "partially-verified", editorialApproval: null }),
        );
        bundle.interpretations = [interpretationRecord({ verificationRecordIds: ["ver-partial-001"] })];
        const result = adaptResearchData(bundle);
        expect(result.published.interpretations).toEqual([]);
        expect(result.excluded).toContainEqual({ kind: "interpretation", id: "justin-martyr-gen-1-26-001", reason: "not-publishable" });
    });
});
