import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import ScriptureMentions from "./NoteScriptureMentions";
import { parseScriptureMentions } from "./scriptureMentions";

const books = [
    { id: 1, name: "Genesis", chapter_count: 50 },
    { id: 19, name: "Psalms", chapter_count: 150 },
    { id: 43, name: "John", chapter_count: 21 },
    { id: 50, name: "Philippians", chapter_count: 4 }
];

describe("Scripture mentions", () => {
    test("recognizes multiple references and ranges while preserving text", () => {
        const content = "Compare Philippians 3:8, John 3:16, and Genesis 1:1–3.";
        const parts = parseScriptureMentions(content, books);
        expect(parts.filter((part) => part.type === "reference")).toHaveLength(3);
        expect(parts.map((part) => part.text).join("")).toBe(content);
        expect(parts.find((part) => part.text === "Genesis 1:1–3")).toMatchObject({
            startChapter: 1,
            startVerse: 1,
            endChapter: 1,
            endVerse: 3
        });
    });

    test("leaves invalid chapters and backwards ranges as ordinary text", () => {
        const parts = parseScriptureMentions("John 99:1 and Genesis 1:3–1", books);
        expect(parts.some((part) => part.type === "reference")).toBe(false);
        expect(parts.map((part) => part.text).join("")).toBe("John 99:1 and Genesis 1:3–1");
    });

    test("renders accessible links that navigate to the full range", async () => {
        const onNavigate = vi.fn();
        render(<p><ScriptureMentions content="Read Psalm 23:1–3." books={books} onNavigate={onNavigate} /></p>);
        await userEvent.click(screen.getByRole("button", { name: "Open Psalm 23:1–3 in Scripture" }));
        expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({
            book: "Psalms",
            startChapter: 23,
            startVerse: 1,
            endVerse: 3
        }));
        expect(screen.getByText(/Read/).parentElement).toHaveTextContent("Read Psalm 23:1–3.");
    });
});
