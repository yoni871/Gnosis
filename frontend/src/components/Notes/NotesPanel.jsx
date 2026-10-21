import NotesHeader from "./NotesHeader";
import NoteComposer from "./NoteComposer";
import NotesList from "./NotesList";
import NotesLoggedOut from "./NotesLoggedOut";


export default function NotesPanel({
    book,
    chapter,
    selectedVerse,
    books,
    notesState
}) {
    const {
        isAuthenticated,
        isAuthLoading,

        notes,
        isLoadingNotes,
        notesError,

        noteContent,
        setNoteContent,
        isSavingNote,

        editingNoteId,
        editContent,
        setEditContent,
        isUpdatingNote,

        deletingNoteId,

        handleSaveNote,
        handleStartEdit,
        handleCancelEdit,
        handleUpdateNote,
        handleDeleteNote,
        draftPassage
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

    // Prefer the captured draft target over the reader's current focus.
    const target = draftPassage || (
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

    // Notes are currently stored only for authenticated users.
    if (!isAuthenticated) {
        return <NotesLoggedOut />;
    }


    return (
        <section
            className="
                h-full
                overflow-y-auto
                bg-[var(--bg-panel)]
            "
        >
            <div
                className="
                    mx-auto
                    w-full
                    max-w-3xl
                    px-5
                    pb-16
                    pt-8
                    sm:px-8
                "
            >
                <NotesHeader
                    notesCount={notes.length}
                />

                <NoteComposer
                    passageLabel={passageLabel}
                    noteContent={noteContent}
                    setNoteContent={setNoteContent}
                    isSavingNote={isSavingNote}
                    onSave={handleSaveNote}
                />

                {notesError && (
                    <div
                        className="
                            mb-7
                            rounded-xl
                            border
                            border-[var(--color-brand)]
                            bg-[var(--bg-surface)]
                            px-5
                            py-4
                        "
                    >
                        <p
                            className="
                                text-xs
                                leading-5
                                text-[var(--color-brand)]
                            "
                        >
                            {notesError}
                        </p>
                    </div>
                )}

                <NotesList
                    notes={notes}
                    books={books}
                    isLoadingNotes={isLoadingNotes}
                    notesError={notesError}
                    editingNoteId={editingNoteId}
                    editContent={editContent}
                    setEditContent={setEditContent}
                    isUpdatingNote={isUpdatingNote}
                    deletingNoteId={deletingNoteId}
                    onStartEdit={handleStartEdit}
                    onCancelEdit={handleCancelEdit}
                    onUpdate={handleUpdateNote}
                    onDelete={handleDeleteNote}
                />
            </div>
        </section>
    );
}