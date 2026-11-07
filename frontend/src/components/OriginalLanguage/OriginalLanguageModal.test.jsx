import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import OriginalLanguageModal from "./OriginalLanguageModal";

// jsdom does not implement scrollIntoView.
beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
});

const GENESIS_PASSAGE = {
    book: "Genesis",
    chapter: 1,
    language: "hebrew",
    startVerse: 1,
    endVerse: 1,
    available: true,
    verses: [
        {
            verse: 1,
            words: [
                {
                    id: 1, wordIndex: 1, wordText: "בְּרֵאשִׁית", transliteration: "be.re.Shit",
                    gloss: "in beginning", strongNumber: "H7225G", strongBase: "H7225",
                    lemma: "רֵאשִׁית", lemmaTransliteration: "re.shit", meaning: "first: beginning",
                    lexicalMorphology: "H:N-F", morphologyCode: "HR/Ncfsa",
                    grammarDisplay: "Preposition + Noun · Common · Feminine · Singular · Absolute",
                    morphemes: [
                        { text: "בְּ", transliteration: "be.", gloss: "in", strongNumber: "H9003",
                            morphologyCode: "HR", morphologyExpanded: "Function=Preposition", isRoot: false },
                        { text: "רֵאשִׁית", transliteration: "re.Shit", gloss: "beginning", strongNumber: "H7225G",
                            morphologyCode: "Ncfsa",
                            morphologyExpanded: "Function=Noun ; Form=Common ; Gender=Feminine; Number=Singular; State=Absolute",
                            isRoot: true },
                    ],
                },
                {
                    id: 2, wordIndex: 2, wordText: "בָּרָא", transliteration: "ba.Ra'",
                    gloss: "he created", strongNumber: "H1254A", strongBase: "H1254",
                    lemma: "בָּרָא", lemmaTransliteration: "ba.ra", meaning: "to create",
                    lexicalMorphology: "H:V", morphologyCode: "HVqp3ms",
                    grammarDisplay: "Verb · Qal · Simple · Active · Perfect · Past/present · Indicative · Third · Masculine · Singular",
                    morphemes: [
                        { text: "בָּרָא", transliteration: "ba.Ra'", gloss: "he created", strongNumber: "H1254A",
                            morphologyCode: "HVqp3ms",
                            morphologyExpanded: "Function=Verb ; Stem=Qal (hence Action=Simple; Voice=Active); Form=Perfect (hence Tense=Past/present; Mood=Indicative); Person=Third; Gender=Masculine; Number=Singular",
                            isRoot: true },
                    ],
                },
            ],
        },
    ],
    sources: [
        { code: "STEPBible-TAHOT", attribution: "Original-language data: STEPBible (Tyndale House / STEPBible.org), CC BY 4.0",
            license: "CC BY 4.0", url: "https://github.com/STEPBible/STEPBible-Data" },
    ],
};

const PHILIPPIANS_PASSAGE = {
    book: "Philippians",
    chapter: 3,
    language: "greek",
    startVerse: 8,
    endVerse: 8,
    available: true,
    verses: [
        {
            verse: 8,
            words: [
                {
                    id: 101, wordIndex: 12, wordText: "γνώσεως", transliteration: "gnōseōs",
                    gloss: "knowledge", strongNumber: "G1108", strongBase: "G1108",
                    lemma: "γνῶσις", lemmaTransliteration: "gnōsis", meaning: "knowledge",
                    lexicalMorphology: "G:N-F", morphologyCode: "N-GSF",
                    grammarDisplay: "Noun · Genitive · Singular · Feminine",
                    morphemes: [
                        { text: "γνώσεως", transliteration: "gnōseōs", gloss: "knowledge", strongNumber: "G1108",
                            morphologyCode: "N-GSF",
                            morphologyExpanded: "Function=Noun; Case=Genitive; Number=Singular; Gender=Feminine",
                            isRoot: true },
                    ],
                },
            ],
        },
    ],
    sources: [
        { code: "STEPBible-TAGNT", attribution: "Original-language data: STEPBible (Tyndale House / STEPBible.org), CC BY 4.0",
            license: "CC BY 4.0", url: "https://github.com/STEPBible/STEPBible-Data" },
    ],
};

// A passage with a word whose gloss is only a STEPBible placeholder
// ("<the>" for the article) and a word ending in punctuation.
const ARTICLE_PASSAGE = {
    book: "Philippians",
    chapter: 3,
    language: "greek",
    startVerse: 8,
    endVerse: 8,
    available: true,
    verses: [
        {
            verse: 8,
            words: [
                {
                    id: 201, wordIndex: 20, wordText: "τὰ", transliteration: "ta",
                    gloss: "<the>", strongNumber: "G3588", strongBase: "G3588",
                    lemma: "ὁ", lemmaTransliteration: "ho", meaning: "the/this/who",
                    lexicalMorphology: "G:T", morphologyCode: "T-APN",
                    grammarDisplay: "Definite article · Accusative · Plural · Neuter",
                    morphemes: [
                        { text: "τὰ", transliteration: "ta", gloss: "<the>", strongNumber: "G3588",
                            morphologyCode: "T-APN",
                            morphologyExpanded: "Function=Definite article; Case=Accusative; Number=Plural; Gender=Neuter",
                            isRoot: true },
                    ],
                },
                {
                    id: 202, wordIndex: 29, wordText: "κερδήσω,", transliteration: "kerdēsō",
                    gloss: "I may gain", strongNumber: "G2770", strongBase: "G2770",
                    lemma: "κερδαίνω", lemmaTransliteration: "kerdainō", meaning: "to gain",
                    lexicalMorphology: "G:V", morphologyCode: "V-AAS-1S",
                    grammarDisplay: "Verb · Aorist · Active · Subjunctive · 1st · Singular",
                    morphemes: [
                        { text: "κερδήσω,", transliteration: "kerdēsō", gloss: "I may gain", strongNumber: "G2770",
                            morphologyCode: "V-AAS-1S",
                            morphologyExpanded: "Function=Verb; Tense=Aorist; Voice=Active; Mood=Subjunctive; Person=1st; Number=Singular",
                            isRoot: true },
                    ],
                },
            ],
        },
    ],
    sources: [
        { code: "STEPBible-TAGNT", attribution: "Original-language data: STEPBible (Tyndale House / STEPBible.org), CC BY 4.0",
            license: "CC BY 4.0", url: "https://github.com/STEPBible/STEPBible-Data" },
    ],
};

const OCCURRENCES = {
    strong: "H7225G",
    strongBase: "H7225",
    lemma: "רֵאשִׁית",
    match: "lemma",
    total: 2,
    limit: 20,
    offset: 0,
    occurrences: [
        { id: 1, book: "Genesis", chapter: 1, verse: 1, wordIndex: 1, language: "hebrew",
            wordText: "בְּרֵאשִׁית", transliteration: "be.re.Shit", gloss: "in beginning",
            strongNumber: "H7225G", strongBase: "H7225", lemma: "רֵאשִׁית",
            grammarDisplay: "Preposition + Noun",
            context: { before: [], after: ["בָּרָא", "אֱלֹהִים", "אֵת"] } },
        { id: 40, book: "Genesis", chapter: 1, verse: 2, wordIndex: 3, language: "hebrew",
            wordText: "רֵאשִׁית", transliteration: "re.Shit", gloss: "beginning",
            strongNumber: "H7225G", strongBase: "H7225", lemma: "רֵאשִׁית",
            grammarDisplay: "Noun",
            context: { before: ["בְּ", "הָ"], after: ["הַ", "שָּׁמַיִם"] } },
    ],
    corpus: "Phase 1 corpus: Genesis 1 and Philippians 3 only.",
    sources: [],
};

function mount(props = {}) {
    const onClose = vi.fn();
    const onNavigateToVerse = vi.fn();
    const fetchMock = vi.fn(async (url) => {
        if (String(url).includes("/occurrences")) {
            return { ok: true, json: async () => OCCURRENCES };
        }
        return { ok: true, json: async () => GENESIS_PASSAGE };
    });
    vi.stubGlobal("fetch", fetchMock);
    const rendered = render(
        <OriginalLanguageModal
            book="Genesis"
            chapter={1}
            startVerse={1}
            endVerse={1}
            englishVerses={[{ verse_number: 1, text: "In the beginning God created the heavens and the earth." }]}
            translation="KJV"
            onClose={onClose}
            onNavigateToVerse={onNavigateToVerse}
            {...props}
        />
    );
    return { onClose, onNavigateToVerse, fetchMock, unmount: rendered.unmount };
}

beforeEach(() => {
    vi.unstubAllGlobals();
});

describe("OriginalLanguageModal", () => {
    test("shows the header, the English passage, and the Hebrew words right-to-left", async () => {
        mount();
        expect(screen.getByRole("dialog", { name: "Original Language Analysis" })).toBeInTheDocument();
        // The language label arrives with the passage fetch.
        expect(await screen.findByText("Genesis 1:1 · Biblical Hebrew")).toBeInTheDocument();
        expect(screen.getByText(/In the beginning God created/)).toBeInTheDocument();
        expect(screen.getByText(/KJV/)).toBeInTheDocument();

        const word = await screen.findByRole("button", { name: /be\.re\.Shit/ });
        expect(word).toHaveAttribute("dir", "rtl");
        expect(screen.getByText("Preposition + Noun · Common · Feminine · Singular · Absolute")).toBeInTheDocument();
        expect(screen.getByText(/STEPBible.*CC BY 4\.0/)).toBeInTheDocument();
    });

    test("shows the Greek passage left-to-right with expanded grammar", async () => {
        const fetchMock = vi.fn(async (url) => {
            if (String(url).includes("/occurrences")) return { ok: true, json: async () => OCCURRENCES };
            return { ok: true, json: async () => PHILIPPIANS_PASSAGE };
        });
        vi.stubGlobal("fetch", fetchMock);
        render(
            <OriginalLanguageModal
                book="Philippians" chapter={3} startVerse={8} endVerse={8}
                englishVerses={[{ verse_number: 8, text: "I count all things as loss." }]}
                translation="ESV" onClose={() => {}} onNavigateToVerse={() => {}}
            />
        );
        expect(await screen.findByText("Philippians 3:8 · Koine Greek")).toBeInTheDocument();
        const word = await screen.findByRole("button", { name: /gnōseōs/ });
        expect(word).toHaveAttribute("dir", "ltr");
        expect(screen.getByText("Noun · Genitive · Singular · Feminine")).toBeInTheDocument();
    });

    test("selecting a word shows its lemma, Strong's, meaning, and grammar detail", async () => {
        mount();
        await userEvent.click(await screen.findByRole("button", { name: /be\.re\.Shit/ }));
        const detail = screen.getByLabelText("Selected word");
        expect(within(detail).getByText("first: beginning")).toBeInTheDocument();
        // The plain Strong's number is shown; the disambiguated lookup
        // key (H7225G) is an internal key and is never displayed.
        expect(within(detail).getByText("H7225")).toBeInTheDocument();
        expect(within(detail).queryByText(/H7225G/)).not.toBeInTheDocument();
        expect(within(detail).getByText("Preposition + Noun · Common · Feminine · Singular · Absolute")).toBeInTheDocument();
        // The verbatim morphology expansion is shown as labeled pairs.
        expect(within(detail).getByText("Feminine")).toBeInTheDocument();
        expect(within(detail).getByText("Absolute")).toBeInTheDocument();
    });

    test("Find Other Occurrences lists references with original-language context", async () => {
        const { fetchMock } = mount();
        await userEvent.click(await screen.findByRole("button", { name: /be\.re\.Shit/ }));
        await userEvent.click(screen.getByRole("button", { name: "Find Other Occurrences" }));
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/lemmas/H7225G/occurrences?match=lemma"));
        expect(await screen.findByText("2 occurrences of this lemma.")).toBeInTheDocument();
        const list = document.querySelector(".gnosis-ol-occurrence-list");
        expect(within(list).getByText("Genesis 1:1")).toBeInTheDocument();
        expect(within(list).getByText("Genesis 1:2")).toBeInTheDocument();
    });

    test("clicking an occurrence closes the modal and navigates to its verse", async () => {
        const { onClose, onNavigateToVerse } = mount();
        await userEvent.click(await screen.findByRole("button", { name: /be\.re\.Shit/ }));
        await userEvent.click(screen.getByRole("button", { name: "Find Other Occurrences" }));
        await userEvent.click(await screen.findByText("Genesis 1:2"));
        expect(onClose).toHaveBeenCalled();
        expect(onNavigateToVerse).toHaveBeenCalledWith(2);
    });

    test("Escape closes the modal and returns focus to the opener", async () => {
        const opener = document.createElement("button");
        opener.textContent = "opener";
        document.body.appendChild(opener);
        opener.focus();
        const { onClose, unmount } = mount();
        expect(screen.getByTestId("ol-close")).toHaveFocus();
        await userEvent.keyboard("{Escape}");
        expect(onClose).toHaveBeenCalled();
        // In the app the parent unmounts the modal on close; that is
        // what restores focus to the opener.
        unmount();
        await waitFor(() => expect(opener).toHaveFocus());
        opener.remove();
    });

    test("the close button closes the modal", async () => {
        const { onClose } = mount();
        await screen.findByRole("button", { name: /be\.re\.Shit/ });
        await userEvent.click(screen.getByTestId("ol-close"));
        expect(onClose).toHaveBeenCalled();
    });

    test("an unimported passage shows the coverage note instead of words", async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({
                ...GENESIS_PASSAGE, available: false, verses: [],
                note: "Original-language data is not available for this passage yet. Phase 1 corpus: Genesis 1 and Philippians 3 only.",
            }),
        }));
        vi.stubGlobal("fetch", fetchMock);
        render(
            <OriginalLanguageModal
                book="Genesis" chapter={2} startVerse={1} endVerse={1}
                englishVerses={[{ verse_number: 1, text: "Thus the heavens and the earth were finished." }]}
                translation="KJV" onClose={() => {}} onNavigateToVerse={() => {}}
            />
        );
        expect(await screen.findByText(/Phase 1 corpus: Genesis 1 and Philippians 3 only/)).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    test("a failed load shows the error", async () => {
        const fetchMock = vi.fn(async () => ({
            ok: false,
            json: async () => ({ error: "Failed to retrieve original-language passage." }),
        }));
        vi.stubGlobal("fetch", fetchMock);
        render(
            <OriginalLanguageModal
                book="Genesis" chapter={1} startVerse={1} endVerse={1}
                englishVerses={[]} translation="KJV" onClose={() => {}} onNavigateToVerse={() => {}}
            />
        );
        expect(await screen.findByRole("alert")).toHaveTextContent(/Failed to retrieve original-language passage/);
    });

    test("the licence is named exactly once in the attribution", async () => {
        mount();
        await screen.findByRole("button", { name: /be\.re\.Shit/ });
        const attribution = screen.getByText(/Original-language data: STEPBible/);
        expect(attribution.textContent.match(/CC BY 4\.0/g)).toHaveLength(1);
    });

    test("a placeholder-only gloss shows an em dash and a word ending in punctuation keeps one comma", async () => {
        const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ARTICLE_PASSAGE }));
        vi.stubGlobal("fetch", fetchMock);
        render(
            <OriginalLanguageModal
                book="Philippians" chapter={3} startVerse={8} endVerse={8}
                englishVerses={[{ verse_number: 8, text: "I count all things as loss." }]}
                translation="ESV" onClose={() => {}} onNavigateToVerse={() => {}}
            />
        );
        // The article's "<the>" placeholder is not a definition: the
        // Meaning cell shows an em dash and "<the>" appears nowhere.
        expect(await screen.findByRole("button", { name: "τὰ, ta" })).toBeInTheDocument();
        expect(screen.queryByText("<the>")).not.toBeInTheDocument();
        expect(screen.getAllByText("—")).toHaveLength(1);
        // The word ending in a comma does not double it in its
        // accessible name.
        expect(screen.getByRole("button", { name: "κερδήσω, kerdēsō, I may gain" })).toBeInTheDocument();
        expect(screen.queryByText(/κερδήσω,,/)).not.toBeInTheDocument();

        // In the detail panel the lexical meaning ("the/this/who") is
        // real and shown, while "in this verse" has no standalone
        // rendering and shows the em dash.
        await userEvent.click(screen.getByRole("button", { name: "τὰ, ta" }));
        const detail = screen.getByLabelText("Selected word");
        expect(within(detail).getByText("the/this/who")).toBeInTheDocument();
        expect(within(detail).getAllByText("—")).toHaveLength(1);
        expect(within(detail).queryByText("<the>")).not.toBeInTheDocument();
    });

    test("verse sections collapse and expand", async () => {
        mount();
        const heading = await screen.findByRole("button", { name: "Verse 1" });
        expect(heading).toHaveAttribute("aria-expanded", "true");
        await userEvent.click(heading);
        expect(heading).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByRole("button", { name: /be\.re\.Shit/ })).not.toBeInTheDocument();
        await userEvent.click(heading);
        expect(await screen.findByRole("button", { name: /be\.re\.Shit/ })).toBeInTheDocument();
    });
});
