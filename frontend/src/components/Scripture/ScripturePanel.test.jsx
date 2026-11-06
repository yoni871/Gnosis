import { render, screen, within } from "@testing-library/react";
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

function mount() {
    const onSelectTranslation = vi.fn();

    render(
        <ScripturePanel
            verses={[]}
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
