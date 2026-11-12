import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import NoteCard from "./NoteCard";
import NoteComposer from "./NoteComposer";

describe("mobile notes inputs", () => {
    test("new-note textarea uses a 16px mobile font without disabling zoom", () => {
        render(
            <NoteComposer
                passageLabel="John 3:16"
                noteContent=""
                setNoteContent={() => {}}
                isSavingNote={false}
                onSave={() => {}}
            />
        );

        const textarea = screen.getByRole("textbox");
        expect(textarea).toHaveClass("text-base", "sm:text-[15px]");
        expect(document.querySelector('meta[name="viewport"]')?.content || "")
            .not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i);
    });

    test("edit textarea uses a 16px mobile font", () => {
        render(
            <NoteCard
                note={{
                    id: 1,
                    book_id: 1,
                    start_chapter: 1,
                    start_verse: 1,
                    end_chapter: 1,
                    end_verse: 1,
                    content: "A note"
                }}
                index={0}
                totalNotes={1}
                books={[{ id: 1, name: "Genesis" }]}
                editingNoteId={1}
                editContent="A note"
                setEditContent={() => {}}
                isUpdatingNote={false}
                deletingNoteId={null}
                onStartEdit={() => {}}
                onCancelEdit={() => {}}
                onUpdate={() => {}}
                onDelete={() => {}}
            />
        );

        expect(screen.getByRole("textbox"))
            .toHaveClass("text-base", "sm:text-[14px]");
    });
});
