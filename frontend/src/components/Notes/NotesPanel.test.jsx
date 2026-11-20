import { expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import NotesPanel from "./NotesPanel";

const BOOKS = [
    { id: 45, name: "Romans" },
    { id: 19, name: "Psalms" },
];

const NOTES = [
    {
        id: 1,
        book_id: 45,
        start_chapter: 8,
        start_verse: 28,
        end_chapter: 8,
        end_verse: 28,
        content: "God works all things together for good.\nSecond line here.",
        created_at: "2026-09-25T18:30:00",
        updated_at: "2026-09-25T18:30:00",
    },
    {
        id: 2,
        book_id: 19,
        start_chapter: 23,
        start_verse: 1,
        end_chapter: 23,
        end_verse: 1,
        content: "The Lord is my shepherd.",
        created_at: "2026-10-02T09:00:00",
        updated_at: "2026-10-02T09:00:00",
    },
];

function baseState(overrides = {}) {
    const selected = NOTES.find(note => note.id === overrides.editingNoteId);
    const content = overrides.editContent ?? selected?.content ?? "";
    const saved = { title: "", content };
    return {
        isAuthenticated: true,
        isAuthLoading: false,
        notes: NOTES,
        isLoadingNotes: false,
        notesError: "",
        noteContent: "",
        setNoteContent: vi.fn(),
        isSavingNote: false,
        editingNoteId: null,
        deletingNoteId: null,
        handleStartEdit: vi.fn(),
        handleDeleteNote: vi.fn(),
        handleCreateDocument: vi.fn().mockResolvedValue(null),
        documents: selected ? { [selected.id]: { ...saved, saved, saving: false, error: "" } } : {},
        changeDocument: vi.fn(), saveDocument: vi.fn(), cancelDocument: vi.fn(),
        nextCursor: null,
        isLoadingMore: false,
        loadMore: vi.fn(),
        draftPassage: null,
        ...overrides,
    };
}

function renderPanel(notesState, props = {}) {
    return render(
        <MemoryRouter>
            <NotesPanel
                book="Romans"
                chapter={8}
                selectedVerse={28}
                books={BOOKS}
                notesState={notesState}
                {...props}
            />
        </MemoryRouter>,
    );
}

test("renders the compact header and independent-note empty state", () => {
    renderPanel(baseState());
    expect(screen.getByRole("button", { name: /Library/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("heading", { name: /Notes/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New Note/ })).toBeInTheDocument();
    expect(screen.getByText("Choose a note or create a new one")).toBeInTheDocument();
    // The library is closed: no note rows are reachable.
    expect(screen.queryByRole("button", { name: /The Lord is my shepherd/ })).toBeNull();
});

test("opens the library drawer with search, titles, previews, and timestamps", async () => {
    const user = userEvent.setup();
    renderPanel(baseState());
    await user.click(screen.getByRole("button", { name: /Library/ }));
    const library = screen.getByRole("dialog", { name: "Notes library" });
    expect(screen.getByRole("button", { name: /Library/ })).toHaveAttribute("aria-expanded", "true");
    expect(within(library).getByRole("searchbox", { name: "Search notes" })).toBeInTheDocument();
    expect(within(library).getByText("Romans 8:28")).toBeInTheDocument();
    expect(within(library).getByText("God works all things together for good.")).toBeInTheDocument();
    expect(within(library).getByText("Sep 25, 2026")).toBeInTheDocument();
    expect(within(library).getByText("Psalms 23:1")).toBeInTheDocument();
    expect(within(library).getByText("The Lord is my shepherd.")).toBeInTheDocument();
});

test("search filters the library by reference and content", async () => {
    const user = userEvent.setup();
    renderPanel(baseState());
    await user.click(screen.getByRole("button", { name: /Library/ }));
    const library = screen.getByRole("dialog", { name: "Notes library" });
    await user.type(within(library).getByRole("searchbox", { name: "Search notes" }), "shepherd");
    expect(within(library).queryByText("Romans 8:28")).toBeNull();
    expect(within(library).getByText("Psalms 23:1")).toBeInTheDocument();
});

test("selecting a note loads it in the editor and closes the drawer", async () => {
    const user = userEvent.setup();
    const state = baseState();
    renderPanel(state);
    await user.click(screen.getByRole("button", { name: /Library/ }));
    await user.click(screen.getByRole("button", { name: /Psalms 23:1/ }));
    expect(state.handleStartEdit).toHaveBeenCalledWith(NOTES[1]);
    expect(screen.getByRole("button", { name: /Library/ })).toHaveAttribute("aria-expanded", "false");
});

test("Escape closes the drawer and returns focus to the Library button", async () => {
    const user = userEvent.setup();
    renderPanel(baseState());
    await user.click(screen.getByRole("button", { name: /Library/ }));
    expect(screen.getByRole("searchbox", { name: "Search notes" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: /Library/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Library/ })).toHaveFocus();
});

test("New Note creates an independent document for the current passage", async () => {
    const user = userEvent.setup();
    const state = baseState({ editingNoteId: 1, editContent: "God works all things together for good." });
    renderPanel(state);
    expect(screen.getByRole("textbox", { name: "Note content" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /New Note/ }));
    expect(state.handleCreateDocument).toHaveBeenCalledWith({
        bookId: 45, startChapter: 8, startVerse: 28, endChapter: 8, endVerse: 28,
    });
});

test("shows the selected note with title, rich editor, save controls, and delete", async () => {
    renderPanel(baseState({ editingNoteId: 2, editContent: "The Lord is my shepherd." }));
    expect(screen.getByRole("textbox", { name: "Note title" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Note content" })).toHaveTextContent("The Lord is my shepherd.");
    expect(screen.getByText(/^Saved/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
});

test("shows the empty library state when there are no notes", async () => {
    const user = userEvent.setup();
    renderPanel(baseState({ notes: [] }));
    await user.click(screen.getByRole("button", { name: /Library/ }));
    expect(screen.getByText("A blank page")).toBeInTheDocument();
});

test("keeps the rich editor mounted while the drawer opens and closes", async () => {
    const user = userEvent.setup();
    renderPanel(baseState({ editingNoteId: 1, editContent: "draft in progress" }));
    const editor = screen.getByRole("textbox", { name: "Note content" });
    expect(editor).toHaveTextContent("draft in progress");
    await user.click(screen.getByRole("button", { name: /Library/ }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("textbox", { name: "Note content" })).toHaveTextContent("draft in progress");
    expect(editor).toBe(screen.getByRole("textbox", { name: "Note content" }));
});
