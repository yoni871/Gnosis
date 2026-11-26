// Tests for the Doctrine workspace's data source (`doctrineStudy.js`).
//
// Every research fixture here is SYNTHETIC — written for testing only,
// clearly labelled as such, and never presented as verified historical
// evidence. The theologians named are historical figures, but every
// quotation, title, date, and citation attached to them in these
// fixtures is invented test data; the tests pin the wiring's honesty
// rules — above all, that the workspace renders research only when the
// adapter's §10 gate passes, and otherwise renders exactly the labeled
// demonstration data it renders today.
import { describe, expect, it } from "vitest";
import { DEMONSTRATION_NOTICE, getWorkDateLabel, passages as demoPassages } from "./doctrineStudies";
import { adaptResearchData } from "./researchAdapter";
import {
    RESEARCH_NOTICE,
    buildStudyFromResearch,
    demonstrationStudy,
    getGeneratedTrinityStudy,
    resolveStudy,
    studyFromPublished,
} from "./doctrineStudy";

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

describe("doctrineStudy demonstration study", () => {
    it("is the labeled demonstration data, unchanged", () => {
        expect(demonstrationStudy.source).toBe("demonstration");
        expect(demonstrationStudy.notice).toBe(DEMONSTRATION_NOTICE);
        expect(demonstrationStudy.passages).toEqual(demoPassages);
        expect(demonstrationStudy.getPassage("gen-1-26")?.label).toBe("Genesis 1:26");
        expect(demonstrationStudy.getFigure("augustine")?.name).toBe("Augustine");
        expect(demonstrationStudy.getInterpretationsForPassage("gen-1-26")).toHaveLength(5);
        expect(demonstrationStudy.getInterpretationsForPassage("john-1-1")).toEqual([]);
        expect(demonstrationStudy.getPassage("no-such-passage")).toBeNull();
    });
});

describe("doctrineStudy buildStudyFromResearch", () => {
    it("builds a research study from a publishable bundle", () => {
        const { study, publishedPassageCount, issues, excluded } = buildStudyFromResearch(publishableBundle());
        expect(issues).toEqual([]);
        expect(excluded).toEqual([]);
        expect(publishedPassageCount).toBe(1);
        expect(study.source).toBe("research");
        expect(study.notice).toBe(RESEARCH_NOTICE);
        expect(study.passages.map((passage) => passage.id)).toEqual(["gen-1-26"]);
        expect(study.passages[0].label).toBe("Genesis 1:26");
        expect(study.getFigure("justin-martyr")?.name).toBe("Justin Martyr");
        // The mapped shapes work with the existing workspace helpers.
        expect(getWorkDateLabel(study.getWork("justin-martyr-first-apology"))).toBe("c. AD 155");
        const interpretations = study.getInterpretationsForPassage("gen-1-26");
        expect(interpretations).toHaveLength(1);
        expect(interpretations[0].quotation).toBe("Synthetic quotation text for testing only.");
        expect(interpretations[0].citation).toBe(
            "Justin Martyr, First Apology, ANF 1, trans. Roberts and Donaldson, ch. 13, https://example.test/first-apology",
        );
        expect(interpretations[0].researchStatus).toBe("editorially-approved");
        expect(study.getInterpretationsForPassage("no-such-passage")).toEqual([]);
        expect(study.getPassage("no-such-passage")).toBeNull();
    });

    it("returns no study when nothing is publishable", () => {
        const bundle = publishableBundle();
        bundle.passages = [passageRecord({ status: "verification-pending" })];
        const { study, publishedPassageCount, issues, excluded } = buildStudyFromResearch(bundle);
        expect(study).toBeNull();
        expect(publishedPassageCount).toBe(0);
        expect(issues).toEqual([]);
        expect(excluded).toContainEqual({ kind: "passage", id: "gen-1-26", reason: "not-publishable" });
    });

    it("keeps only the publishable passages in a mixed bundle", () => {
        const bundle = publishableBundle();
        bundle.passages = [
            passageRecord(),
            passageRecord({
                id: "john-1-1",
                book: "John",
                chapter: 1,
                verseStart: 1,
                verseEnd: 3,
                canonicalOrder: 43,
                status: "verification-pending",
                verificationRecordIds: ["ver-john-001"],
            }),
        ];
        bundle.verificationRecords.push(
            verificationRecord({ id: "ver-john-001", claimId: "john-claim" }),
        );
        const { study, publishedPassageCount } = buildStudyFromResearch(bundle);
        expect(publishedPassageCount).toBe(1);
        expect(study.passages.map((passage) => passage.id)).toEqual(["gen-1-26"]);
        expect(study.passageInterpretations).toEqual({ "gen-1-26": ["justin-martyr-gen-1-26-001"] });
    });

    it("returns no study for an empty or missing bundle", () => {
        for (const bundle of [{}, { doctrine: "trinity" }, null, undefined]) {
            const { study, publishedPassageCount } = buildStudyFromResearch(bundle);
            expect(study).toBeNull();
            expect(publishedPassageCount).toBe(0);
        }
    });
});

describe("doctrineStudy resolveStudy", () => {
    it("resolves to the research study when one exists", () => {
        const { study, publishedPassageCount } = resolveStudy(publishableBundle());
        expect(study.source).toBe("research");
        expect(publishedPassageCount).toBe(1);
    });

    it("falls back to the demonstration study when nothing is publishable", () => {
        const bundle = publishableBundle();
        bundle.passages = [passageRecord({ status: "verification-pending" })];
        const { study, publishedPassageCount } = resolveStudy(bundle);
        expect(study).toBe(demonstrationStudy);
        expect(study.source).toBe("demonstration");
        expect(publishedPassageCount).toBe(0);
    });

    it("falls back to the demonstration study for an empty bundle", () => {
        const { study } = resolveStudy({});
        expect(study).toBe(demonstrationStudy);
    });
});

describe("doctrineStudy studyFromPublished", () => {
    it("builds a research study from adapted published data", () => {
        const adapted = adaptResearchData(publishableBundle());
        const study = studyFromPublished(adapted.published);
        expect(study).not.toBeNull();
        expect(study.source).toBe("research");
        expect(study.notice).toBe(RESEARCH_NOTICE);
        expect(study.passages).toHaveLength(1);
        expect(study.passages[0].id).toBe("gen-1-26");
        expect(study.getPassage("gen-1-26")?.label).toBe("Genesis 1:26");
        expect(study.getFigure("justin-martyr")?.name).toBe("Justin Martyr");
        expect(study.getWork("justin-martyr-first-apology")?.title).toBe("First Apology");
        expect(study.getInterpretationsForPassage("gen-1-26")).toHaveLength(1);
    });

    it("returns null when the published set is empty", () => {
        expect(
            studyFromPublished({
                passages: [],
                figures: [],
                works: [],
                interpretations: [],
                passageInterpretations: {},
            }),
        ).toBeNull();
        expect(studyFromPublished(null)).toBeNull();
        expect(studyFromPublished(undefined)).toBeNull();
    });

    it("matches buildStudyFromResearch on the same bundle", () => {
        const bundle = publishableBundle();
        const adapted = adaptResearchData(bundle);
        const fromPublished = studyFromPublished(adapted.published);
        const fromBundle = buildStudyFromResearch(bundle).study;
        expect(fromPublished.passages).toEqual(fromBundle.passages);
        expect(fromPublished.figures).toEqual(fromBundle.figures);
        expect(fromPublished.works).toEqual(fromBundle.works);
        expect(fromPublished.interpretations).toEqual(fromBundle.interpretations);
        expect(fromPublished.source).toBe(fromBundle.source);
    });
});

describe("doctrineStudy getGeneratedTrinityStudy", () => {
    it("returns null while the generated study holds nothing publishable", () => {
        // The test script generates the study from the real tree before
        // vitest runs, and the real tree has zero publishable passages
        // — so the generated file is empty and there is no study. If
        // the file does not exist at all (a bare vitest run), the glob
        // matches nothing and this returns null the same way.
        expect(getGeneratedTrinityStudy()).toBeNull();
    });
});
