import { formatNoteDate, getNoteReference } from "./notesUtils";
import NotesEditor from "./NotesEditor";
import NotesToolbar from "./NotesToolbar";

// The Notes editor area: the document surface of Notes 2.0.
//
// Shows the note being written (new-note composer for the selected passage)
// or the note selected from the library (edit mode). Both use the
// <NotesEditor /> slot, so the rich-text editor plugs in here without
// touching the layout. The area stays mounted while the library drawer
// opens and closes, preserving editor state and focus.

export default function NotesEditorArea({
    notesState,
    books,
    passageLabel,
    editorRef,
    onFormat,
}) {
    const {
        notes,
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
        handleCancelEdit,
        handleUpdateNote,
        handleDeleteNote,
    } = notesState;

    const editingNote = editingNoteId
        ? notes.find((note) => note.id === editingNoteId)
        : null;

    return (
        <div className="flex h-full min-h-0 flex-col bg-[var(--bg-panel)]">
            {editingNote ? (
                <>
                    {/* Selected note: reference + timestamp */}
                    <div className="shrink-0 px-5 pb-1 pt-4">
                        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                            Reflection
                        </p>
                        <h3 className="mt-1 font-serif text-lg font-semibold text-[var(--color-brand)]">
                            {getNoteReference(editingNote, books)}
                        </h3>
                        {editingNote.updated_at && (
                            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                                {editingNote.updated_at !== editingNote.created_at
                                    ? `Edited ${formatNoteDate(editingNote.updated_at)}`
                                    : formatNoteDate(editingNote.created_at)}
                            </p>
                        )}
                    </div>

                    <NotesToolbar onFormat={onFormat} disabled={isUpdatingNote} />

                    <div className="min-h-0 flex-1">
                        <NotesEditor
                            value={editContent}
                            onChange={setEditContent}
                            placeholder="Write what you notice, what you wonder, or what you want to remember..."
                            disabled={isUpdatingNote}
                            ariaLabel={`Edit reflection on ${getNoteReference(editingNote, books)}`}
                            inputRef={editorRef}
                            className="sm:text-[14px]"
                        />
                    </div>

                    <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
                        <button
                            type="button"
                            onClick={() => handleDeleteNote(editingNote.id)}
                            disabled={isUpdatingNote || deletingNoteId === editingNote.id}
                            className="rounded-full px-4 py-2 text-[11px] font-semibold text-[var(--text-muted)] transition hover:bg-[var(--hover-bg)] hover:text-[var(--color-brand)] disabled:opacity-40"
                        >
                            {deletingNoteId === editingNote.id ? "Deleting..." : "Delete"}
                        </button>
                        <button
                            type="button"
                            onClick={handleCancelEdit}
                            disabled={isUpdatingNote}
                            className="rounded-full border border-[var(--border)] px-4 py-2 text-[11px] font-semibold text-[var(--text-muted)] transition hover:bg-[var(--hover-bg)] disabled:opacity-40"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => handleUpdateNote(editingNote.id)}
                            disabled={isUpdatingNote || !editContent.trim()}
                            className="rounded-full bg-[var(--color-brand)] px-5 py-2 text-[11px] font-semibold text-white transition hover:bg-[var(--color-brand-dark)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {isUpdatingNote ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </>
            ) : (
                <>
                    {/* New note: selected passage (or a prompt to pick one) */}
                    <div className="shrink-0 px-5 pb-1 pt-4">
                        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                            Selected Passage
                        </p>
                        {passageLabel ? (
                            <h3 className="mt-1 font-serif text-lg font-semibold text-[var(--color-brand)]">
                                {passageLabel}
                            </h3>
                        ) : (
                            <p className="mt-2 font-serif text-sm italic leading-6 text-[var(--text-muted)]">
                                Select a verse from Scripture when you&apos;re ready to write.
                            </p>
                        )}
                    </div>

                    {passageLabel && (
                        <>
                            <NotesToolbar onFormat={onFormat} disabled={isSavingNote} />

                            <div className="min-h-0 flex-1">
                                <NotesEditor
                                    value={noteContent}
                                    onChange={setNoteContent}
                                    placeholder="Write what you notice, what you wonder, or what you want to remember..."
                                    disabled={isSavingNote}
                                    ariaLabel={`New reflection on ${passageLabel}`}
                                    inputRef={editorRef}
                                    className="sm:text-[15px]"
                                />
                            </div>

                            <div className="flex shrink-0 items-center justify-between gap-4 border-t border-[var(--border)] px-4 py-3">
                                <p className="hidden font-serif text-[10px] italic text-[var(--text-muted)] sm:block">
                                    Private to your Gnosis account
                                </p>
                                <button
                                    type="button"
                                    onClick={handleSaveNote}
                                    disabled={isSavingNote || !noteContent.trim()}
                                    className="ml-auto rounded-full bg-[var(--color-brand)] px-6 py-2.5 text-[11px] font-semibold tracking-[0.04em] text-white shadow-sm transition hover:bg-[var(--color-brand-dark)] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {isSavingNote ? "Saving..." : "Save Reflection"}
                                </button>
                            </div>
                        </>
                    )}
                </>
            )}

            {notesError && (
                <div className="shrink-0 border-t border-[var(--color-brand)] bg-[var(--bg-surface)] px-5 py-3">
                    <p className="text-xs leading-5 text-[var(--color-brand)]">{notesError}</p>
                </div>
            )}
        </div>
    );
}
