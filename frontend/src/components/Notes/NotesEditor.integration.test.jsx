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

    test("spacing commands apply data attributes, keep the text, and report the active setting", async () => {
        const editorRef = createRef();
        const onChange = vi.fn();
        const onFormatState = vi.fn();
        render(<NotesEditor value="<p>Grace</p><p>Peace</p>" onChange={onChange} books={books}
            inputRef={editorRef} ariaLabel="Note content" onFormatState={onFormatState} />);
        const editor = screen.getByRole("textbox", { name: "Note content" });
        await waitFor(() => expect(editorRef.current).toBeTruthy());
        fireEvent.focus(editor);
        editorRef.current.format({ kind: "lineHeight", value: "2" });
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(
            expect.stringContaining('<p data-line-height="2">Grace</p>'),
        ));
        editorRef.current.format({ kind: "paragraphSpacing", value: "large" });
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(
            expect.stringContaining('data-paragraph-spacing="large"'),
        ));
        expect(editor).toHaveTextContent("GracePeace");
        expect(onFormatState).toHaveBeenCalledWith(expect.objectContaining({
            lineHeight: "2", paragraphSpacing: "large",
        }));
    });

    test("removes executable markup while retaining supported formatting", () => {
        expect(sanitizeNoteHtml('<p onclick="bad()"><strong>Safe</strong><script>alert(1)</script></p>'))
            .toBe("<p><strong>Safe</strong></p>");
    });

    test("sanitizer round trips Scripture marks without allowing arbitrary classes or attributes", () => {
        const html = '<p><a data-scripture="true" data-target="{}" class="note-scripture-link">John 3:16</a> and text</p>';
        expect(sanitizeNoteHtml(html)).toBe(html);
        expect(sanitizeNoteHtml(sanitizeNoteHtml(html))).toBe(html);
        expect(sanitizeNoteHtml('<p><a data-scripture="true" class="evil" onclick="bad()">John</a></p>'))
            .toBe('<p><a data-scripture="true" class="note-scripture-link">John</a></p>');
    });

    test("sanitizer keeps whitelisted spacing attributes on paragraphs and headings", () => {
        const html = '<h2 data-line-height="2">Title</h2><p data-line-height="1.15" data-paragraph-spacing="large">Body</p>';
        expect(sanitizeNoteHtml(html)).toBe(html);
        expect(sanitizeNoteHtml(sanitizeNoteHtml(html))).toBe(html);
    });

    test("sanitizer strips spacing values outside the allowlist and spacing on other tags", () => {
        expect(sanitizeNoteHtml('<p data-line-height="3">Body</p>')).toBe("<p>Body</p>");
        expect(sanitizeNoteHtml('<p data-paragraph-spacing="huge">Body</p>')).toBe("<p>Body</p>");
        expect(sanitizeNoteHtml('<p data-line-height="1.5; color: red">Body</p>')).toBe("<p>Body</p>");
        expect(sanitizeNoteHtml('<ul><li data-line-height="2">Item</li></ul>')).toBe("<ul><li>Item</li></ul>");
        expect(sanitizeNoteHtml('<p style="line-height: 2">Body</p>')).toBe("<p>Body</p>");
    });

});
