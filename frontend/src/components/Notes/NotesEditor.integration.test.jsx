import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { beforeAll, describe, expect, test, vi } from "vitest";
import NotesEditor from "./NotesEditor";
import { sanitizeNoteHtml } from "./noteRichText";

const books = [
    { id: 43, name: "John", chapter_count: 21, verse_counts: { 3: 36 } },
    { id: 1, name: "Genesis", chapter_count: 50, verse_counts: { 1: 31 } },
];

beforeAll(() => {
    if (!Range.prototype.getClientRects) Range.prototype.getClientRects = () => [];
    if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = () => ({
        left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0,
    });
});

describe("Notes rich-text editor", () => {
    test("detects valid inline references and navigates from the editor", async () => {
        const onReferenceClick = vi.fn();
        render(<NotesEditor value="<p>Read John <strong>3:16</strong> and John 3:99.</p>" onChange={vi.fn()}
            books={books} onReferenceClick={onReferenceClick} ariaLabel="Note content" />);

        await waitFor(() => expect(document.querySelectorAll("a[data-scripture]")).toHaveLength(2));
        const links = [...document.querySelectorAll("a[data-scripture]")];
        expect(links[0].dataset.target).toBe(links[1].dataset.target);
        expect(screen.queryByText("John 3:99", { selector: "a[data-scripture]" })).toBeNull();
        fireEvent.click(links[1]);
        expect(onReferenceClick).toHaveBeenCalledWith(expect.objectContaining({
            book: "John", startChapter: 3, startVerse: 16, endVerse: 16,
        }));
    });

    test("toolbar commands preserve editor content and emit rich HTML", async () => {
        const editorRef = createRef();
        const onChange = vi.fn();
        render(<NotesEditor value="<p>Grace</p>" onChange={onChange} books={books}
            inputRef={editorRef} ariaLabel="Note content" />);
        const editor = screen.getByRole("textbox", { name: "Note content" });
        await waitFor(() => expect(editorRef.current).toBeTruthy());
        fireEvent.focus(editor);
        editorRef.current.format("heading");
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.stringContaining("<h2>")));
        expect(editor).toHaveTextContent("Grace");
    });

    test("removes executable markup while retaining supported formatting", () => {
        expect(sanitizeNoteHtml('<p onclick="bad()"><strong>Safe</strong><script>alert(1)</script></p>'))
            .toBe("<p><strong>Safe</strong></p>");
    });
});
