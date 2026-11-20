import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import NotesEditor from "./NotesEditor";

// The Notes 2.0 editor slot replaced the NoteComposer / NoteCard textareas
// (PR: Notes UI Foundation). The iOS zoom rule still applies to the slot:
// 16px on mobile, desktop sizes unchanged, and zoom must stay enabled.
describe("mobile notes inputs", () => {
    test("new-note editor uses a 16px mobile font without disabling zoom", () => {
        render(
            <NotesEditor
                value=""
                onChange={() => {}}
                placeholder="Write a note..."
                ariaLabel="New reflection on John 3:16"
                className="sm:text-[15px]"
            />
        );

        const textarea = screen.getByRole("textbox");
        expect(textarea).toHaveClass("text-base", "sm:text-[15px]");
        expect(document.querySelector('meta[name="viewport"]')?.content || "")
            .not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i);
    });

    test("edit editor uses a 16px mobile font", () => {
        render(
            <NotesEditor
                value="A note"
                onChange={() => {}}
                ariaLabel="Edit reflection on Genesis 1:1"
                className="sm:text-[14px]"
            />
        );

        expect(screen.getByRole("textbox"))
            .toHaveClass("text-base", "sm:text-[14px]");
    });
});
