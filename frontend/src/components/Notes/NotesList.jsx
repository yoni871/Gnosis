import NoteCard from "./NoteCard";
import NotesEmptyState from "./NotesEmptyState";

export default function NotesList({
    notes,
    books,
    isLoadingNotes,
    notesError,

    editingNoteId,
    editContent,
    setEditContent,

    isUpdatingNote,
    deletingNoteId,

    onStartEdit,
    onCancelEdit,
    onUpdate,
    onDelete
}) {
    return (
        <>
            {/* Section heading */}
            <div className="mb-5">
                <div
                    className="
                        flex
                        items-end
                        justify-between
                        gap-4
                    "
                >
                    <div>
                        <p
                            className="
                                text-[9px]
                                font-bold
                                uppercase
                                tracking-[0.22em]
                                text-[var(--color-accent-text)]
                            "
                        >
                            Your Journal
                        </p>

                        <h2
                            className="
                                mt-1
                                font-serif
                                text-xl
                                font-semibold
                                text-[var(--text-primary)]
                            "
                        >
                            Reflections
                        </h2>
                    </div>

                    {!isLoadingNotes &&
                        notes.length > 0 && (
                            <p
                                className="
                                    text-[9px]
                                    uppercase
                                    tracking-[0.12em]
                                    text-[var(--text-muted)]
                                "
                            >
                                Newest first
                            </p>
                        )}
                </div>

                <div
                    className="
                        mt-3
                        h-px
                        w-full
                        bg-[var(--border)]
                    "
                />
            </div>


            {/* Loading */}
            {isLoadingNotes && (
                <div className="py-12 text-center">
                    <div
                        className="
                            mx-auto
                            mb-4
                            h-7
                            w-7
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
                            text-xs
                            italic
                            text-[var(--text-muted)]
                        "
                    >
                        Gathering your reflections...
                    </p>
                </div>
            )}


            {/* Empty */}
            {!isLoadingNotes &&
                !notesError &&
                notes.length === 0 && (
                    <NotesEmptyState />
                )}


            {/* Notes */}
            {!isLoadingNotes &&
                notes.map((note, index) => (
                    <NoteCard
                        key={note.id}

                        note={note}
                        index={index}
                        totalNotes={notes.length}
                        books={books}

                        editingNoteId={editingNoteId}
                        editContent={editContent}
                        setEditContent={setEditContent}

                        isUpdatingNote={isUpdatingNote}
                        deletingNoteId={deletingNoteId}

                        onStartEdit={onStartEdit}
                        onCancelEdit={onCancelEdit}
                        onUpdate={onUpdate}
                        onDelete={onDelete}
                    />
                ))}
        </>
    );
}