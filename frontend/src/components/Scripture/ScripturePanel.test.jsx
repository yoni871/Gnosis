import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test, vi } from "vitest";

import ScripturePanel from "./ScripturePanel";

// jsdom does not implement Element.scrollTo / scrollIntoView, which the
// panel calls when the reading location changes.
beforeAll(() => {
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
});

// Database order, as /translations returns it: the default translation
// is the third row (KJV), so the fixture must keep this order.
const translations = [
    { id: 1, abbreviation: "BSB", name: "Berean Standard Bible" },
    { id: 2, abbreviation: "WEB", name: "World English Bible" },
    { id: 3, abbreviation: "KJV", name: "King James Version" },
    { id: 4, abbreviation: "ASV", name: "American Standard Version" },
    { id: 5, abbreviation: "ESV", name: "English Standard Version" },
    { id: 6, abbreviation: "NIV", name: "New International Version" },
    { id: 7, abbreviation: "NLT", name: "New Living Translation" },
    { id: 8, abbreviation: "NKJV", name: "New King James Version" },
    { id: 9, abbreviation: "NASB", name: "New American Standard Bible" },
];

function mount({ verses = [], versesLoading = false } = {}) {
    const onSelectTranslation = vi.fn();

    render(
        <ScripturePanel
            verses={verses}
            versesLoading={versesLoading}
            book="Genesis"
            chapter={1}
            translation="KJV"
            translations={translations}
            selectedVerse={null}
            setSelectedVerse={() => {}}
            setTranslation={onSelectTranslation}
            books={[{ id: 2, name: "Genesis" }]}
            bookmarksState={{ findBookmark: () => null, error: null }}
            highlightsState={{
                highlights: [],
                error: null,
                isLoading: false,
                isSaving: false,
            }}
            verseSelection={{
                selection: { bookId: null, verses: [] },
                toggleVerse: () => {},
                clearSelection: () => {},
            }}
        />,
    );

    return { onSelectTranslation };
}

async function openMenu() {
    await userEvent.click(screen.getByRole("button", { name: "KJV" }));
    return screen.getByTestId("translation-list");
}

describe("ScripturePanel translation dropdown", () => {
    test("searches names and abbreviations without changing selection, and resets after Escape or outside click", async () => {
        const user = userEvent.setup();
        const { onSelectTranslation } = mount();
        await openMenu();
        const search = screen.getByRole("searchbox", { name: "Search translations" });
        expect(search).not.toHaveFocus();
        await user.click(search);
        expect(search).toHaveFocus();
        expect(within(screen.getByTestId("translation-list")).getByRole("button", { pressed: true })).toHaveTextContent("KJV");
        await user.type(search, "english standard");
        expect(within(screen.getByTestId("translation-list")).getAllByRole("button")).toHaveLength(1);
        expect(screen.getByText("ESV")).toBeVisible();
        await user.clear(search);
        await user.type(search, "niv");
        expect(screen.getByText("New International Version")).toBeVisible();
        await user.type(search, "missing");
        expect(screen.getByRole("status")).toHaveTextContent("No results found");
        expect(onSelectTranslation).not.toHaveBeenCalled();
        await user.keyboard("{Escape}");
        expect(screen.getByRole("button", { name: "KJV" })).toHaveFocus();
        await openMenu();
        expect(screen.getByRole("searchbox")).toHaveValue("");
        await user.type(screen.getByRole("searchbox"), "esv");
        await user.click(screen.getByText("HOLY BIBLE"));
        expect(screen.queryByRole("searchbox")).toBeNull();
        await openMenu();
        expect(screen.getByRole("searchbox")).toHaveValue("");
    });

    test("chooses a filtered translation with arrow keys and Enter", async () => {
        const user = userEvent.setup();
        const { onSelectTranslation } = mount();
        await openMenu();
        await user.type(screen.getByRole("searchbox"), "standard");
        await user.keyboard("{ArrowDown}{End}{Home}{Enter}");
        expect(onSelectTranslation).toHaveBeenCalledExactlyOnceWith("ASV");
        expect(screen.queryByRole("searchbox")).toBeNull();
        expect(screen.getByRole("button", { name: "KJV" })).toHaveFocus();
    });

    test("the open list is capped in height and scrolls instead of growing with every translation", async () => {
        mount();

        const list = await openMenu();

        expect(list.className).toContain("max-h-[300px]");
        expect(list.className).toContain("overflow-y-auto");

        // The cap must not drop entries: every translation stays in the list.
        // (Scoped to the list: the selected abbreviation also shows on the button.)
        for (const translation of translations) {
            expect(
                within(list).getByText(translation.abbreviation),
            ).toBeInTheDocument();
        }
    });

    test("the list shows translations in alphabetical order by abbreviation", async () => {
        mount();

        const list = await openMenu();

        const shownAbbreviations = Array.from(list.children).map(
            (item) => item.firstElementChild.textContent,
        );
        const expected = [...translations]
            .map((translation) => translation.abbreviation)
            .sort((a, b) => a.localeCompare(b));

        // The fixture is deliberately not alphabetical, so this fails
        // unless the panel sorts before rendering.
        expect(shownAbbreviations).toEqual(expected);
    });

    test("picking a translation still selects it and closes the list", async () => {
        const { onSelectTranslation } = mount();

        await openMenu();
        await userEvent.click(screen.getByText("ESV"));

        expect(onSelectTranslation).toHaveBeenCalledWith("ESV");
        expect(
            screen.queryByTestId("translation-list"),
        ).not.toBeInTheDocument();
    });
});

// The reader moves on a chapter change or an explicit jump to a verse,
// never because a verse was deselected.
const chapterVerses = [
    {
        verse_number: 1,
        text: "In the beginning God created the heaven and the earth.",
    },
    {
        verse_number: 2,
        text: "And the earth was without form, and void.",
    },
    {
        verse_number: 3,
        text: "And God said, Let there be light.",
    },
];

function selectionOf(...verses) {
    return {
        bookId: 2,
        verses: verses.map((verse) => ({ chapter: 1, verse })),
    };
}

function mountReader({
    verses = chapterVerses,
    selectedVerse = null,
    selection = { bookId: null, verses: [] },
} = {}) {
    const props = {
        verses,
        book: "Genesis",
        chapter: 1,
        translation: "KJV",
        translations,
        selectedVerse,
        setSelectedVerse: () => {},
        setTranslation: () => {},
        books: [{ id: 2, name: "Genesis" }],
        bookmarksState: { findBookmark: () => null, error: null },
        highlightsState: {
            highlights: [],
            error: null,
            isLoading: false,
            isSaving: false,
        },
        verseSelection: {
            selection,
            toggleVerse: () => {},
            clearSelection: () => {},
        },
    };
    const result = render(<ScripturePanel {...props} />);
    return {
        ...result,
        rerenderReader: (next) =>
            result.rerender(<ScripturePanel {...props} {...next} />),
    };
}

describe("ScripturePanel verse presentation", () => {
    test("the chapter heading follows book and chapter navigation", () => {
        const { rerenderReader } = mountReader();
        expect(screen.getByRole("heading", { name: "GENESIS 1" })).toBeInTheDocument();

        rerenderReader({ book: "John", chapter: 3 });
        expect(screen.getByRole("heading", { name: "JOHN 3" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "GENESIS 1" })).not.toBeInTheDocument();
    });

    test("keeps each verse's number and complete text together in reading order", () => {
        mountReader();

        const renderedVerses = chapterVerses.map(({ verse_number, text }) => {
            const verse = screen.getByText(text);
            expect(verse.querySelector("sup")).toHaveTextContent(String(verse_number));
            expect(verse.textContent).toBe(`${verse_number}${text}`);
            return verse;
        });

        expect(Array.from(renderedVerses[0].parentElement.children)).toEqual(renderedVerses);
    });

    test("clicking a verse still selects its original passage", async () => {
        const toggleVerse = vi.fn();
        const setSelectedVerse = vi.fn();
        const { rerenderReader } = mountReader();
        rerenderReader({
            setSelectedVerse,
            verseSelection: {
                selection: selectionOf(),
                toggleVerse,
                clearSelection: vi.fn(),
            },
        });

        await userEvent.click(screen.getByText(chapterVerses[1].text));

        expect(toggleVerse).toHaveBeenCalledWith(2, 1, 2);
        expect(setSelectedVerse).toHaveBeenCalledWith(2);
    });
});

describe("ScripturePanel reading scroll", () => {
    test("deselecting the focused verse leaves the scroll position alone", () => {
        const { rerenderReader } = mountReader({
            selectedVerse: 2,
            selection: selectionOf(2),
        });
        // The mount itself scrolls to the focused verse; clear that away.
        Element.prototype.scrollTo.mockClear();
        Element.prototype.scrollIntoView.mockClear();

        rerenderReader({
            selectedVerse: null,
            verseSelection: {
                selection: { bookId: null, verses: [] },
                toggleVerse: () => {},
                clearSelection: () => {},
            },
        });

        expect(Element.prototype.scrollTo).not.toHaveBeenCalled();
        expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    });

    test("focus falling back to another selected verse after a deselect leaves the scroll alone", () => {
        const { rerenderReader } = mountReader({
            selectedVerse: 2,
            selection: selectionOf(1, 2),
        });
        Element.prototype.scrollTo.mockClear();
        Element.prototype.scrollIntoView.mockClear();

        rerenderReader({
            selectedVerse: 1,
            verseSelection: {
                selection: selectionOf(1),
                toggleVerse: () => {},
                clearSelection: () => {},
            },
        });

        expect(Element.prototype.scrollTo).not.toHaveBeenCalled();
        expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    });

    test("jumping to a verse that was not selected scrolls to that verse", () => {
        const { rerenderReader } = mountReader({
            selectedVerse: null,
            selection: { bookId: null, verses: [] },
        });
        Element.prototype.scrollTo.mockClear();
        Element.prototype.scrollIntoView.mockClear();

        rerenderReader({
            selectedVerse: 3,
            verseSelection: {
                selection: selectionOf(3),
                toggleVerse: () => {},
                clearSelection: () => {},
            },
        });

        expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
        expect(
            Element.prototype.scrollIntoView.mock.instances[0].textContent,
        ).toContain("Let there be light");
    });

    test("a new chapter scrolls to the top when nothing is focused", () => {
        const { rerenderReader } = mountReader({
            selectedVerse: null,
            selection: { bookId: null, verses: [] },
        });
        Element.prototype.scrollTo.mockClear();
        Element.prototype.scrollIntoView.mockClear();

        // A new chapter is a new location, not just new verses: the same
        // chapter re-fetched in another translation must stay put (below).
        rerenderReader({
            chapter: 2,
            verses: [
                {
                    verse_number: 1,
                    text: "Now the serpent was more subtil than any beast of the field.",
                },
            ],
        });

        expect(Element.prototype.scrollTo).toHaveBeenCalledWith(
            expect.objectContaining({ top: 0 }),
        );
    });

    test("switching translation in the same chapter leaves the scroll alone", () => {
        const { rerenderReader } = mountReader({
            selectedVerse: null,
            selection: { bookId: null, verses: [] },
        });
        Element.prototype.scrollTo.mockClear();
        Element.prototype.scrollIntoView.mockClear();

        // Same book and chapter, new verses array and new translation:
        // the reader re-fetches the chapter and must stay where it was.
        rerenderReader({
            translation: "ESV",
            verses: [
                {
                    verse_number: 1,
                    text: "In the beginning, God created the heavens and the earth.",
                },
                {
                    verse_number: 2,
                    text: "The earth was without form and void.",
                },
                {
                    verse_number: 3,
                    text: "And God said, “Let there be light,” and there was light.",
                },
            ],
        });

        expect(Element.prototype.scrollTo).not.toHaveBeenCalled();
        expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    });
});

describe("ScripturePanel original language", () => {
    const passage = {
        book: "Genesis",
        chapter: 1,
        language: "hebrew",
        startVerse: 1,
        endVerse: 2,
        available: true,
        verses: [
            {
                verse: 1,
                words: [
                    {
                        id: 1, wordIndex: 1, wordText: "בְּרֵאשִׁית", transliteration: "be.re.Shit",
                        gloss: "in beginning", strongNumber: "H7225G", strongBase: "H7225",
                        lemma: "רֵאשִׁית", meaning: "first: beginning", morphologyCode: "HR/Ncfsa",
                        grammarDisplay: "Preposition + Noun",
                        morphemes: [],
                    },
                ],
            },
        ],
        sources: [],
    };

    test("the toolbar offers original language analysis for the selected range", async () => {
        mountReader({ selectedVerse: 2, selection: selectionOf(1, 2) });
        // The toolbar is portaled out of the verse's text flow.
        const button = screen.getByTestId("ol-toolbar-button");
        expect(button).toBeInTheDocument();
        expect(button.closest(".scripture-verse")).toBeNull();
        const toolbar = button.closest('[role="group"]');
        for (const label of ["Bookmark", "Highlight", "Original Language"]) {
            expect(within(toolbar).getByText(label)).toBeInTheDocument();
        }
        expect(within(toolbar).getByLabelText("Clear verse selection")).toBeInTheDocument();
    });

    test("opening the modal shows the range and the English passage; closing keeps the selection", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => passage })));
        const clearSelection = vi.fn();
        const { rerenderReader } = mountReader({
            selectedVerse: 2,
            selection: selectionOf(1, 2),
        });
        // The test's mountReader wires a no-op clearSelection; replace it
        // with a spy by rerendering with the same selection.
        rerenderReader({
            verseSelection: {
                selection: selectionOf(1, 2),
                toggleVerse: () => {},
                clearSelection,
            },
        });

        fireEvent.click(screen.getByTestId("ol-toolbar-button"));
        expect(await screen.findByText("Genesis 1:1–2 · Biblical Hebrew")).toBeInTheDocument();
        const dialog = screen.getByRole("dialog", { name: "Original Language Analysis" });
        expect(within(dialog).getByText(/In the beginning God created/)).toBeInTheDocument();
        expect(within(dialog).getByText(/And the earth was without form/)).toBeInTheDocument();

        await userEvent.keyboard("{Escape}");
        expect(clearSelection).not.toHaveBeenCalled();
        // The selection — and its toolbar — are still there.
        expect(screen.getByTestId("ol-toolbar-button")).toBeInTheDocument();
        vi.unstubAllGlobals();
    });

    test("no original language button appears without a selection", () => {
        mountReader({ selectedVerse: null, selection: { bookId: null, verses: [] } });
        expect(screen.queryByTestId("ol-toolbar-button")).not.toBeInTheDocument();
    });
});

describe("ScripturePanel chapter loading", () => {
    const genesisOne = {
        verse_number: 1,
        text: "In the beginning God created the heaven and the earth.",
    };

    test("shows a loading note while the chapter loads instead of an empty pane", () => {
        mount({ verses: [], versesLoading: true });

        expect(screen.getByText("Loading Scripture…")).toBeInTheDocument();
    });

    test("does not show the loading note once verses arrive", () => {
        mount({ verses: [genesisOne], versesLoading: false });

        expect(
            screen.queryByText("Loading Scripture…"),
        ).not.toBeInTheDocument();
        expect(screen.getByText(/In the beginning/)).toBeInTheDocument();
    });

    test("keeps showing verses while a new chapter loads", () => {
        mount({ verses: [genesisOne], versesLoading: true });

        expect(
            screen.queryByText("Loading Scripture…"),
        ).not.toBeInTheDocument();
        expect(screen.getByText(/In the beginning/)).toBeInTheDocument();
    });
});
