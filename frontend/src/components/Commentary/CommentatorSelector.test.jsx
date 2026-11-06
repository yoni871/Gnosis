import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import CommentatorSelector from "./CommentatorSelector";

const commentators = [
    { id: 3, name: "Matthew Henry", title: "Matthew Henry's Complete Commentary" },
    { id: 4, name: "Jamieson, Fausset & Brown", title: "Commentary Critical and Explanatory" },
    { id: 5, name: "Adam Clarke", title: "Adam Clarke's Commentary" },
    { id: 6, name: "John Wesley", title: "John Wesley's Explanatory Notes" },
    { id: 7, name: "John Calvin", title: "John Calvin's Commentaries" },
    { id: 8, name: "Albert Barnes", title: "Barnes' Notes on the Bible" },
    { id: 9, name: "Joseph Benson", title: "Benson's Commentary" },
    { id: 10, name: "Geneva Bible", title: "Geneva Bible Notes" },
];

function mount(open = true, onSelect = () => {}, onToggle = () => {}) {
    render(
        <CommentatorSelector
            commentators={commentators}
            selectedCommentator={3}
            setSelectedCommentator={onSelect}
            isCommentaryOpen={open}
            setIsCommentaryOpen={onToggle}
        />,
    );
}

describe("CommentatorSelector dropdown scrolling", () => {
    test("the open list is capped in height and scrolls instead of growing with every commentary", () => {
        mount();

        const list = screen.getByTestId("commentator-list");
        expect(list.className).toContain("max-h-[300px]");
        expect(list.className).toContain("overflow-y-auto");

        // The cap must not drop entries: every commentary stays in the list.
        // (Scoped to the list: the selected name also shows on the button.)
        for (const commentator of commentators) {
            expect(within(list).getByText(commentator.name)).toBeInTheDocument();
        }
    });

    test("the list shows commentaries in alphabetical order by name", () => {
        mount();

        const list = screen.getByTestId("commentator-list");
        const shownNames = Array.from(list.children).map(
            (item) => item.firstElementChild.textContent
        );
        const expected = [...commentators]
            .map((commentator) => commentator.name)
            .sort((a, b) => a.localeCompare(b));

        // The fixture is deliberately not alphabetical, so this fails
        // unless the selector sorts before rendering.
        expect(shownNames).toEqual(expected);
    });

    test("picking a commentary still selects it and closes the list", async () => {
        const onSelect = vi.fn();
        const onToggle = vi.fn();
        mount(true, onSelect, onToggle);

        await userEvent.click(screen.getByText("John Calvin"));

        expect(onSelect).toHaveBeenCalledWith(7);
        expect(onToggle).toHaveBeenCalledWith(false);
    });
});
