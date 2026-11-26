// Trinity page with a generated research study: the page passes the
// generated study to the workspace, and the workspace renders
// verified research instead of the demonstration data.
//
// The generated-study reader is mocked (the real reader looks for
// frontend/src/generated/doctrine/*.json); the study itself is built
// by the real adapter + studyFromPublished from a synthetic
// publishable bundle, so the page is exercised against a genuine
// research study shape. Every research fixture here is SYNTHETIC —
// written for testing only, clearly labelled as such, and never
// presented as verified historical evidence. Scripture text is
// synthetic too ("Genesis 1 verse 26.") — the tests assert wiring
// and labeling, never real KJV wording.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import TraceTheDoctrineTrinityPage from "./TraceTheDoctrineTrinityPage";

vi.mock("../data/doctrineStudy.js", async (importOriginal) => {
    const actual = await importOriginal();
    const { adaptResearchData } = await import("../data/researchAdapter.js");
    const bundle = {
        doctrine: "trinity",
        passages: [
            {
                id: "synth-gen-1-26",
                doctrine: "trinity",
                book: "Genesis",
                chapter: 1,
                verseStart: 26,
                verseEnd: 26,
                canonicalOrder: 1,
                status: "editorially-approved",
                evidenceClassification: "direct",
                relationshipToDoctrine: {
                    text: "Synthetic relationship for testing only.",
                    status: "editorially-approved",
                },
                crossReferences: [],
                interpretiveQuestions: [],
                verificationRecordIds: ["ver-synth-001"],
                notes: null,
            },
        ],
        authors: [
            {
                id: "synth-justin",
                displayName: "Synthetic Justin",
                status: "verified",
                bio: null,
                dates: null,
                verificationRecordIds: [],
                notes: null,
            },
        ],
        works: [
            {
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
            },
        ],
        interpretations: [
            {
                id: "synth-interp-001",
                passageId: "synth-gen-1-26",
                authorId: "synth-justin",
                workId: "synth-first-apology",
                status: "editorially-approved",
                quotation: {
                    text: "Synthetic published quotation about the Trinity, uniquely worded for the page test.",
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
            },
        ],
        verificationRecords: [
            {
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
            },
        ],
    };
    const adapted = adaptResearchData(bundle);
    const study = actual.studyFromPublished(adapted.published);
    return { ...actual, getGeneratedTrinityStudy: () => study };
});

const { getBibleChapter, getTranslations } = vi.hoisted(() => ({
    getBibleChapter: vi.fn(),
    getTranslations: vi.fn(),
}));

vi.mock("../services/bibleService", () => ({ getBibleChapter, getTranslations }));

const TRANSLATIONS = [
    { abbreviation: "KJV", name: "King James Version" },
    { abbreviation: "ESV", name: "English Standard Version" },
];

function chapterVerses(book, chapter, count) {
    return Array.from({ length: count }, (_, index) => ({
        verse_number: index + 1,
        text: `${book} ${chapter} verse ${index + 1}.`,
    }));
}

function renderPage() {
    return render(
        <MemoryRouter initialEntries={["/trace-the-doctrine/trinity"]}>
            <ThemeProvider>
                <AuthContext.Provider value={{ user: null, isAuthLoading: false, logout: vi.fn() }}>
                    <TraceTheDoctrineTrinityPage />
                </AuthContext.Provider>
            </ThemeProvider>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    getTranslations.mockResolvedValue(TRANSLATIONS);
    getBibleChapter.mockImplementation(async (book) => {
        if (book === "Genesis") return chapterVerses("Genesis", 1, 27);
        return [];
    });
});

describe("TraceTheDoctrineTrinityPage with a generated research study", () => {
    it("renders the verified research study, with no demonstration labels", async () => {
        renderPage();
        await screen.findByText("Genesis 1 verse 26.");
        // Research notice, not the demonstration notice.
        // The research notice renders three times on the page —
        // workspace, interpretation panel, and timeline — so assert
        // on all of them, as the workspace test does.
        expect(
            screen.getAllByText(/Verified research — quotations, titles, and dates checked/).length,
        ).toBeGreaterThanOrEqual(3);
        expect(screen.queryByText(/Demonstration data/)).toBeNull();
        expect(screen.queryByText("Prototype")).toBeNull();
        // The research theologian, quotation, title, and date render.
        expect(screen.getByRole("heading", { name: "Synthetic Justin" })).toBeInTheDocument();
        expect(
            screen.getByText("Synthetic published quotation about the Trinity, uniquely worded for the page test."),
        ).toBeInTheDocument();
        expect(screen.getByText("Synthetic First Apology")).toBeInTheDocument();
        // The work date renders twice on the page — interpretation
        // panel and timeline — so assert on both, as for the notice.
        expect(screen.getAllByText("c. AD 155")).toHaveLength(2);
        // No pending placeholders: the title and date are verified.
        expect(screen.queryByText("Title pending verification")).toBeNull();
        expect(screen.queryByText("Date pending verification")).toBeNull();
        expect(screen.queryByText(/Quotation pending verification/)).toBeNull();
    });
});
