import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import OriginalLanguageWordTable from "./OriginalLanguageWordTable";

const WORDS = [
    {
        id: 1, wordIndex: 4, language: "hebrew", wordText: "אֲרָמִית", transliteration: "'a.ra.Mit",
        gloss: "Aramaic", grammarDisplay: "Adjective · Feminine · Singular · Absolute",
    },
    {
        id: 2, wordIndex: 5, language: "aramaic", wordText: "מַלְכָּא", transliteration: "mal.Ka'",
        gloss: "O king", grammarDisplay: "Noun · Common · Masculine · Singular · Determined",
    },
];

function setWrapMeasurements(wrap, { scrollWidth, clientWidth, scrollLeft }) {
    Object.defineProperty(wrap, "scrollWidth", { configurable: true, get: () => scrollWidth });
    Object.defineProperty(wrap, "clientWidth", { configurable: true, get: () => clientWidth });
    Object.defineProperty(wrap, "scrollLeft", { configurable: true, get: () => scrollLeft });
}

describe("OriginalLanguageWordTable", () => {
    test("an Aramaic word in a Hebrew verse carries its own language tag and lang", () => {
        const onSelectWord = vi.fn();
        render(<OriginalLanguageWordTable words={WORDS} language="hebrew" selectedWordId={null} onSelectWord={onSelectWord} />);
        const aramaicWord = screen.getByRole("button", { name: /mal\.Ka/ });
        expect(aramaicWord).toHaveAttribute("lang", "arc");
        const hebrewWord = screen.getByRole("button", { name: /'a\.ra\.Mit/ });
        expect(hebrewWord).toHaveAttribute("lang", "he");
        // Only the Aramaic word carries a visible language tag (the
        // Hebrew word's Meaning cell also reads "Aramaic" — that is
        // its gloss, not a tag — so the tag is checked by class).
        const tags = document.querySelectorAll(".gnosis-ol-word-language");
        expect(tags).toHaveLength(1);
        expect(tags[0]).toHaveTextContent("Aramaic");
        expect(screen.queryByText("Hebrew")).not.toBeInTheDocument();
    });

    test("clicking a word selects it", async () => {
        const onSelectWord = vi.fn();
        render(<OriginalLanguageWordTable words={WORDS} language="hebrew" selectedWordId={null} onSelectWord={onSelectWord} />);
        await userEvent.click(screen.getByRole("button", { name: /mal\.Ka/ }));
        expect(onSelectWord).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
    });

    test("the swipe hint appears while columns are hidden and disappears at the end", () => {
        const onSelectWord = vi.fn();
        render(<OriginalLanguageWordTable words={WORDS} language="hebrew" selectedWordId={null} onSelectWord={onSelectWord} />);
        const wrap = document.querySelector(".gnosis-ol-table-wrap");
        // jsdom reports no overflow, so nothing is hidden at first.
        expect(screen.queryByText("Swipe to see more →")).not.toBeInTheDocument();
        // A narrow container hides the Grammar column (395px table in
        // a 358px wrap, as measured at 390px).
        setWrapMeasurements(wrap, { scrollWidth: 395, clientWidth: 358, scrollLeft: 0 });
        fireEvent.scroll(wrap);
        expect(screen.getByText("Swipe to see more →")).toBeInTheDocument();
        // Scrolled to the end: nothing more to reveal, so the hint goes.
        setWrapMeasurements(wrap, { scrollWidth: 395, clientWidth: 358, scrollLeft: 37 });
        fireEvent.scroll(wrap);
        expect(screen.queryByText("Swipe to see more →")).not.toBeInTheDocument();
    });

    test("no swipe hint when the whole table fits", () => {
        const onSelectWord = vi.fn();
        render(<OriginalLanguageWordTable words={WORDS} language="hebrew" selectedWordId={null} onSelectWord={onSelectWord} />);
        const wrap = document.querySelector(".gnosis-ol-table-wrap");
        setWrapMeasurements(wrap, { scrollWidth: 300, clientWidth: 358, scrollLeft: 0 });
        fireEvent.scroll(wrap);
        expect(screen.queryByText("Swipe to see more →")).not.toBeInTheDocument();
    });
});
