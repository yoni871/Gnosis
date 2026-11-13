import { useRef, useState } from "react";
import NotesHeader from "./NotesHeader";
import NotesEditorArea from "./NotesEditorArea";
import NotesLibrary from "./NotesLibrary";
import NotesLoggedOut from "./NotesLoggedOut";

// Notes 2.0 — UI Foundation (Phase 1).
//
// Layout: a compact header (Library + New Note), the editor area, and a
// library drawer that slides in from the left edge of this panel and
// overlays the editor. The drawer is clipped to the panel, so it never
// covers or resizes Scripture. The editor stays mounted while the drawer
// opens and closes, preserving editor state and focus.
//
// The panel owns only layout and drawer state. All note data and CRUD live
// in useNotes (unchanged); the editor surface is the <NotesEditor /> slot,
// which Codex's rich-text editor will replace without touching this file.
// Formatting behavior is Codex's: the toolbar reports actions through
// onFormat and this panel forwards them (currently a no-op).

export default function NotesPanel({
    book,
    chapter,
    selectedVerse,
    books,
    notesState,
    // Optional: Codex's rich-text editor calls this with the chosen
    // formatting action (e.g. "bold"). Until the editor lands, the
    // toolbar is presentational and this is a no-op.
    onFormat,
}) {
    const [libraryOpen, setLibraryOpen] = useState(false);
    const editorRef = useRef(null);
    const libraryButtonRef = useRef(null);

    const {
        isAuthenticated,
        isAuthLoading,
        notes,
        handleStartEdit,
        handleCancelEdit,
    } = notesState;

    // Wait until AuthContext finishes restoring the user.
    if (isAuthLoading) {
        return (
            <section
                className="
                    flex
                    h-full
                    items-center
                    justify-center
                    bg-[var(--bg-panel)]
                "
            >
                <div className="text-center">
                    <div
                        className="
                            mx-auto
                            mb-4
                            h-8
                            w-8
                            animate-spin
                            rounded-full
                            border-2
                            border-[var(--border)]
                            border-t-[var(--color-accent)]
                        "
                    />

                    <p
                        className="
                            font-serif
                            text-sm
                            italic
                            text-[var(--text-muted)]
                        "
                    >
                        Opening your journal...
                    </p>
                </div>
            </section>
        );
    }

    // Notes are currently stored only for authenticated users.
    if (!isAuthenticated) {
        return <NotesLoggedOut />;
    }

    // Prefer the captured draft target over the reader's current focus.
    const target = notesState.draftPassage || (
        selectedVerse
            ? {
                bookId: books.find((item) => item.name === book)?.id,
                startChapter: chapter,
                startVerse: selectedVerse,
                endChapter: chapter,
                endVerse: selectedVerse
            }
            : null
    );

    // Resolve the draft's book independently of the currently displayed book.
    const targetBook = target
        ? books.find((item) => item.id === target.bookId)?.name
        : null;

    // Format the starting reference and append an ending reference when needed.
    let passageLabel = "";

    if (target && targetBook) {
        passageLabel =
            `${targetBook} ${target.startChapter}:${target.startVerse}`;

        if (target.startChapter !== target.endChapter) {
            passageLabel += `–${target.endChapter}:${target.endVerse}`;
        } else if (target.startVerse !== target.endVerse) {
            passageLabel += `–${target.endVerse}`;
        }
    }

    const openLibrary = () => setLibraryOpen(true);

    const closeLibrary = () => {
        setLibraryOpen(false);
        libraryButtonRef.current?.focus();
    };

    // Load a note from the library into the editor, then close the drawer
    // and put focus in the editor.
    const handleSelectNote = (note) => {
        handleStartEdit(note);
        setLibraryOpen(false);
        // The editor stays mounted; focus it after the edit state applies.
        requestAnimationFrame(() => editorRef.current?.focus());
    };

    // Start a fresh note: leave any note being edited, close the library,
    // and focus the composer.
    const handleNewNote = () => {
        handleCancelEdit();
        setLibraryOpen(false);
        requestAnimationFrame(() => editorRef.current?.focus());
    };

    return (
        <section
            className="
                relative
                flex
                h-full
                min-h-0
                flex-col
                overflow-hidden
                bg-[var(--bg-panel)]
            "
        >
            <NotesHeader
                libraryButtonRef={libraryButtonRef}
                libraryOpen={libraryOpen}
                onToggleLibrary={() =>
                    libraryOpen ? closeLibrary() : openLibrary()
                }
                onNewNote={handleNewNote}
                notesCount={notes.length}
            />

            <div className="relative min-h-0 flex-1">
                <NotesEditorArea
                    notesState={notesState}
                    books={books}
                    passageLabel={passageLabel}
                    editorRef={editorRef}
                    onFormat={onFormat}
                />

                <NotesLibrary
                    open={libraryOpen}
                    onClose={closeLibrary}
                    onSelectNote={handleSelectNote}
                    selectedNoteId={notesState.editingNoteId}
                    notes={notes}
                    books={books}
                    isLoadingNotes={notesState.isLoadingNotes}
                    notesError={notesState.notesError}
                />
            </div>
        </section>
    );
}
