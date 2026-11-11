import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, test, vi } from "vitest";

import CommentaryPanel from "./CommentaryPanel";

// jsdom does not implement Element.scrollIntoView, which a selected
// commentary entry calls to bring itself into view.
beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
});

const commentators = [
    { id: 3, name: "Matthew Henry" },
    { id: 4, name: "Jamieson, Fausset & Brown" },
];

const entries = [
    {
        id: 101,
        entry_title: "Genesis 1",
        description: "The creation of the world.",
        content: "In the beginning God created the heaven and the earth.",
        start_chapter: 1,
        start_verse: 1,
        end_chapter: 1,
        end_verse: 3,
    },
    {
        id: 102,
        entry_title: "Genesis 1",
        description: "The creation of the world.",
        content: "And God said, Let there be light: and there was light.",
        start_chapter: 1,
        start_verse: 3,
        end_chapter: 1,
        end_verse: 5,
    },
];

function mountPanel({ commentary = entries, isLoading = false, commentaryError = "" } = {}) {
    render(
        <CommentaryPanel
            book="Genesis"
            chapter={1}
            selectedVerse={null}
            commentaryState={{
                commentary,
                selectedCommentator: 3,
                setSelectedCommentator: () => {},
                commentators,
                isLoading,
                commentaryError,
            }}
        />,
    );
}

describe("CommentaryPanel loading", () => {
    test("entries stay visible while a new commentator loads", () => {
        // Switching commentators re-fetches the same chapter: the old
        // entries must stay on screen instead of collapsing to the
        // loading note, or the panel loses its scroll position.
        mountPanel({ commentary: entries, isLoading: true });

        expect(
            screen.queryByText("Loading commentary…"),
        ).not.toBeInTheDocument();
        expect(
            screen.getByText("In the beginning God created the heaven and the earth."),
        ).toBeInTheDocument();
        expect(
            screen.getByText("And God said, Let there be light: and there was light."),
        ).toBeInTheDocument();
    });

    test("the loading note only shows when there is nothing to show yet", () => {
        mountPanel({ commentary: [], isLoading: true });

        expect(screen.getByText("Loading commentary…")).toBeInTheDocument();
    });
});
