// Workspace wiring tests: the Doctrine workspace renders from a study.
//
// The default (no study prop) renders exactly the labeled demonstration
// data it renders today. A research study — built through the adapter
// from a synthetic publishable bundle — renders the verified research
// with its own labels, and a bundle with nothing publishable resolves
// back to the demonstration study.
//
// Scripture text here is synthetic ("Genesis 1 verse 26.") — the tests
// assert labeling, state, and content routing, never real KJV wording.
// Every research fixture is synthetic, written for testing only.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../context/ThemeContext";
import DoctrineWorkspace from "./DoctrineWorkspace";
import { buildStudyFromResearch, resolveStudy } from "../../data/doctrineStudy";

const { getBibleChapter, getTranslations } = vi.hoisted(() => ({
    getBibleChapter: vi.fn(),
    getTranslations: vi.fn(),
}));

vi.mock("../../services/bibleService", () => ({ getBibleChapter, getTranslations }));

function chapterVerses(book, chapter, count) {
    return Array.from({ length: count }, (_, index) => ({
        verse_number: index + 1,
        text: `${book} ${chapter} verse ${index + 1}.`,
    }));
}

function renderWorkspace(study) {
    return render(
        <MemoryRouter initialEntries={["/trace-the-doctrine/trinity"]}>
            <ThemeProvider>
                <DoctrineWorkspace study={study} />
            </ThemeProvider>
        </MemoryRouter>,
    );
}

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

function researchBundle(overrides = {}) {
    return {
        doctrine: "trinity",
        passages: [
            {
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
            },
        ],
        authors: [
            {
                id: "justin-martyr",
                displayName: "Justin Martyr",
                status: "not-started",
                bio: null,
                dates: null,
                verificationRecordIds: [],
                notes: null,
            },
        ],
        works: [
            {
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
            },
        ],
        interpretations: [
            {
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
            },
        ],
        verificationRecords: [
            verificationRecord(),
            verificationRecord({ id: "ver-work-justin-001", claimId: "work-title-claim", claimType: "attribution" }),
            verificationRecord({ id: "ver-interp-justin-001", claimId: "interp-claim", claimType: "quotation" }),
        ],
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    getTranslations.mockResolvedValue([
        { abbreviation: "KJV", name: "King James Version" },
        { abbreviation: "ESV", name: "English Standard Version" },
    ]);
    getBibleChapter.mockImplementation(async (book) => {
        if (book === "Genesis") return chapterVerses("Genesis", 1, 27);
        return [];
    });
});

describe("DoctrineWorkspace study wiring", () => {
    it("renders the labeled demonstration data by default, exactly as today", async () => {
        const user = userEvent.setup();
        renderWorkspace(undefined);
        expect(screen.getByText("Prototype")).toBeInTheDocument();
        expect(screen.getAllByText("Demonstration data").length).toBeGreaterThanOrEqual(3);
        expect(screen.getAllByText(/Demonstration data — the theologian entries are placeholders pending research/).length).toBeGreaterThanOrEqual(3);
        expect(screen.getByLabelText("Passage")).toHaveValue("gen-1-26");
        expect(await screen.findByText("Genesis 1 verse 26.")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Justin Martyr" })).toBeInTheDocument();
        expect(screen.getByText(/Quotation pending verification/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Source details" }));
        expect(screen.getByText("Demonstration data — pending verification")).toBeInTheDocument();
        expect(screen.queryByText("Verified research")).toBeNull();
    });

    it("renders a research study with verified labels and the verified quotation", async () => {
        const { study } = buildStudyFromResearch(researchBundle());
        expect(study).not.toBeNull();
        const user = userEvent.setup();
        renderWorkspace(study);
        expect(screen.queryByText("Prototype")).toBeNull();
        expect(screen.queryByText("Demonstration data")).toBeNull();
        expect(screen.getAllByText("Verified research").length).toBeGreaterThanOrEqual(3);
        expect(screen.getAllByText(/Verified research — quotations, titles, and dates checked/).length).toBeGreaterThanOrEqual(3);
        expect(screen.getByLabelText("Passage")).toHaveValue("gen-1-26");
        expect(await screen.findByText("Genesis 1 verse 26.")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Justin Martyr" })).toBeInTheDocument();
        expect(screen.getByText("Synthetic quotation text for testing only.")).toBeInTheDocument();
        expect(screen.getByText("Justin Martyr, First Apology, ANF 1, trans. Roberts and Donaldson, ch. 13, https://example.test/first-apology")).toBeInTheDocument();
        expect(screen.getAllByText("c. AD 155").length).toBeGreaterThanOrEqual(2);
        await user.click(screen.getByRole("button", { name: "Source details" }));
        expect(screen.getByText("Verified research — editorially-approved")).toBeInTheDocument();
    });

    it("falls back to the demonstration data when the bundle has nothing publishable", async () => {
        const bundle = researchBundle();
        bundle.passages = [{ ...bundle.passages[0], status: "verification-pending" }];
        const { study } = resolveStudy(bundle);
        renderWorkspace(study);
        expect(screen.getByText("Prototype")).toBeInTheDocument();
        expect(screen.getAllByText("Demonstration data").length).toBeGreaterThanOrEqual(3);
        expect(screen.queryByText("Verified research")).toBeNull();
        expect(screen.getByLabelText("Passage")).toHaveValue("gen-1-26");
        expect(await screen.findByText("Genesis 1 verse 26.")).toBeInTheDocument();
    });
});
