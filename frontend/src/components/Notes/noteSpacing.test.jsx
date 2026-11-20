import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { NoteSpacingExtension } from "./NoteSpacingExtension";
import { readActiveSpacing } from "./noteSpacing";

beforeAll(() => {
    if (!Range.prototype.getClientRects) Range.prototype.getClientRects = () => [];
    if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = () => ({
        left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0,
    });
});

let editor = null;
afterEach(() => { editor?.destroy(); editor = null; });

function createEditor(content) {
    const element = document.createElement("div");
    document.body.appendChild(element);
    editor = new Editor({
        element,
        extensions: [
            StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
            NoteSpacingExtension,
        ],
        content,
    });
    return editor;
}

describe("note spacing extension", () => {
    test("sets line height on the paragraph at the cursor and keeps its text", () => {
        createEditor("<p>Grace upon grace</p>");
        editor.commands.setTextSelection(2);
        expect(editor.commands.setLineHeight("2")).toBe(true);
        expect(editor.getHTML()).toBe('<p data-line-height="2">Grace upon grace</p>');
        expect(readActiveSpacing(editor.state)).toEqual({ lineHeight: "2", paragraphSpacing: "medium" });
    });

    test("sets paragraph spacing on every selected paragraph, leaving others alone", () => {
        createEditor("<p>First</p><p>Second</p><p>Third</p>");
        // Selection spans the first two paragraphs only (positions 1..11).
        editor.commands.setTextSelection({ from: 1, to: 11 });
        expect(editor.commands.setParagraphSpacing("large")).toBe(true);
        expect(editor.getHTML()).toBe(
            '<p data-paragraph-spacing="large">First</p><p data-paragraph-spacing="large">Second</p><p>Third</p>',
        );
        // Cursor in the third paragraph still reports the defaults.
        editor.commands.setTextSelection(17);
        expect(readActiveSpacing(editor.state)).toEqual({ lineHeight: "1.5", paragraphSpacing: "medium" });
    });

    test("mixed spacing within one note: each block keeps its own setting", () => {
        createEditor("<p>Single</p><p>Double</p>");
        editor.commands.setTextSelection(2);
        editor.commands.setLineHeight("1");
        editor.commands.setTextSelection(10);
        editor.commands.setLineHeight("2");
        expect(editor.getHTML()).toBe(
            '<p data-line-height="1">Single</p><p data-line-height="2">Double</p>',
        );
    });

    test("applies to headings and to the paragraph inside list items, not the item itself", () => {
        createEditor("<h2>Title</h2><ul><li><p>One</p></li><li><p>Two</p></li></ul>");
        editor.commands.selectAll();
        editor.commands.setLineHeight("2");
        editor.commands.setParagraphSpacing("large");
        const html = editor.getHTML();
        expect(html).toContain('<h2 data-line-height="2" data-paragraph-spacing="large">Title</h2>');
        expect(html).toContain('<p data-line-height="2" data-paragraph-spacing="large">One</p>');
        expect(html).toContain('<p data-line-height="2" data-paragraph-spacing="large">Two</p>');
        expect(html).not.toContain("<li data-");
    });

    test("rejects values outside the allowlist and leaves the document unchanged", () => {
        createEditor("<p>Steady</p>");
        editor.commands.setTextSelection(2);
        expect(editor.commands.setLineHeight("3")).toBe(false);
        expect(editor.commands.setLineHeight("1.5; color: red")).toBe(false);
        expect(editor.commands.setParagraphSpacing("huge")).toBe(false);
        expect(editor.getHTML()).toBe("<p>Steady</p>");
    });

    test("a spacing change is a single undo step and redo restores it", () => {
        createEditor("<p>Undo me</p>");
        editor.commands.setTextSelection(2);
        editor.commands.setLineHeight("2");
        expect(editor.getHTML()).toBe('<p data-line-height="2">Undo me</p>');
        expect(editor.commands.undo()).toBe(true);
        expect(editor.getHTML()).toBe("<p>Undo me</p>");
        expect(editor.commands.redo()).toBe(true);
        expect(editor.getHTML()).toBe('<p data-line-height="2">Undo me</p>');
    });

    test("parses saved spacing attributes back from HTML", () => {
        createEditor('<p data-line-height="1.15" data-paragraph-spacing="small">Restored</p>');
        expect(editor.getHTML()).toBe('<p data-line-height="1.15" data-paragraph-spacing="small">Restored</p>');
        editor.commands.setTextSelection(2);
        expect(readActiveSpacing(editor.state)).toEqual({ lineHeight: "1.15", paragraphSpacing: "small" });
    });

    test("ignores invalid saved spacing attributes", () => {
        createEditor('<p data-line-height="9" data-paragraph-spacing="huge">Plain</p>');
        expect(editor.getHTML()).toBe("<p>Plain</p>");
    });

    test("selecting 1.5 Normal writes the 1.5 attribute and reports 1.5", () => {
        createEditor("<p>Normal</p>");
        editor.commands.setTextSelection(2);
        expect(editor.commands.setLineHeight("1.5")).toBe(true);
        expect(editor.getHTML()).toBe('<p data-line-height="1.5">Normal</p>');
        expect(readActiveSpacing(editor.state)).toEqual({ lineHeight: "1.5", paragraphSpacing: "medium" });
    });
});

describe("note spacing stylesheet", () => {
    test("untouched paragraphs render at exactly 1.5, matching the toolbar's 1.5 Normal", () => {
        const css = readFileSync(join(import.meta.dirname, "Notes.css"), "utf8");
        const ruleBlock = (selector) => {
            const start = css.indexOf(selector);
            expect(start).toBeGreaterThanOrEqual(0);
            const open = css.indexOf("{", start);
            const close = css.indexOf("}", open);
            return css.slice(open + 1, close);
        };
        // The base rule is what an untouched paragraph renders at; it
        // must be the value the toolbar reports for unset spacing, or
        // the dropdown lies about the rendered text.
        expect(ruleBlock(".notes-tiptap-editor")).toContain("line-height: 1.5");
        expect(ruleBlock(".notes-tiptap-editor")).not.toContain("line-height: 1.65");
        // And explicitly selecting 1.5 produces exactly 1.5.
        expect(ruleBlock('.notes-tiptap-editor p[data-line-height="1.5"]')).toContain("line-height: 1.5");
    });
});
