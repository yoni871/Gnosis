import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import ScriptureMentions from "./NoteScriptureMentions";
import { parseScriptureMentions } from "./scriptureMentions";

const books = [
    { id: 1, name: "Genesis", chapter_count: 50, verse_counts: { 1: 31, 2: 25 } },
    { id: 19, name: "Psalms", chapter_count: 150, verse_counts: { 23: 6 } },
    { id: 43, name: "John", chapter_count: 21, verse_counts: { 3: 36 } },
    { id: 50, name: "Philippians", chapter_count: 4, verse_counts: { 3: 21 } }
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

    test("leaves out-of-range verses and range ends as ordinary text", () => {
        const content = "John 3:99, Genesis 1:1–32, and Genesis 1:30–2:26 stay plain.";
        const parts = parseScriptureMentions(content, books);
        expect(parts.some((part) => part.type === "reference")).toBe(false);
        expect(parts.map((part) => part.text).join("")).toBe(content);
    });

    test("accepts cross-chapter ranges within the verse counts", () => {
        const parts = parseScriptureMentions("Genesis 1:30–2:3", books);
        expect(parts).toHaveLength(1);
        expect(parts[0]).toMatchObject({
            type: "reference",
            startChapter: 1,
            startVerse: 30,
            endChapter: 2,
            endVerse: 3
        });
    });

    test("rejects a chapter with no verses stored for it", () => {
        const partial = [{ id: 1, name: "Genesis", chapter_count: 50, verse_counts: { 1: 31 } }];
        const parts = parseScriptureMentions("Genesis 2:1", partial);
        expect(parts.some((part) => part.type === "reference")).toBe(false);
        expect(parts.map((part) => part.text).join("")).toBe("Genesis 2:1");
    });

    test("validates chapters but skips verse bounds when verse data is absent", () => {
        const sparse = [{ id: 43, name: "John", chapter_count: 21 }];
        const parts = parseScriptureMentions("John 3:99 is unchecked, John 99:1 is not.", sparse);
        expect(parts.filter((part) => part.type === "reference").map((part) => part.text))
            .toEqual(["John 3:99"]);
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
