import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import NotesPanel from "./NotesPanel";
import { sanitizeRichText } from "./notesContent";

const books = [{ id: 43, name: "John", chapter_count: 21, verse_counts: { 3: 36 } }];
const note = { id: 7, title: "Grace", content: "Remember John 3:16", created_at: "2026-11-12" };

function state(overrides = {}) {
    return {
        isAuthenticated: true, isAuthLoading: false, notes: [note], isLoadingNotes: false,
        notesError: "", nextCursor: null, isLoadingMore: false, loadMore: vi.fn(),
        createDocument: vi.fn(), saveDocument: vi.fn().mockResolvedValue(true), handleDeleteNote: vi.fn(),
        ...overrides
    };
}

test("library searches, opens a note, and live-detects Scripture references", async () => {
    const notesState = state();
    render(<NotesPanel books={books} notesState={notesState} navigateToPassage={vi.fn()} translation="BSB" />);
    fireEvent.change(screen.getByPlaceholderText("Search notes"), { target: { value: "grace" } });
    expect(screen.getByRole("textbox", { name: "Note title" })).toHaveValue("Grace");
    expect(screen.getByRole("button", { name: "John 3:16" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Note title" }), { target: { value: "Grace received" } });
    await waitFor(() => expect(notesState.saveDocument).toHaveBeenCalledWith(7, "Grace received", note.content), { timeout: 1200 });
});

test("new note uses the independent document action", async () => {
    const createDocument = vi.fn().mockResolvedValue({ id: 8, title: null, content: "<p><br></p>" });
    render(<NotesPanel books={books} notesState={state({ notes: [], createDocument })} navigateToPassage={vi.fn()} translation="BSB" />);
    fireEvent.click(screen.getByRole("button", { name: "Create a note" }));
    await waitFor(() => expect(createDocument).toHaveBeenCalled());
});

test("rich note markup drops executable HTML and attributes", () => {
    expect(sanitizeRichText('<h2 onclick="alert(1)">Safe</h2><img src=x onerror="alert(1)"><script>alert(1)</script>')).toBe("<h2>Safe</h2>");
});
