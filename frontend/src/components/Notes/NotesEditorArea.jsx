import { formatNoteDate } from "./notesUtils";
import NotesEditor from "./NotesEditor";
import NotesToolbar from "./NotesToolbar";

export default function NotesEditorArea({ notesState, books, editorRef, onFormat, onReferenceClick }) {
    const { notes, notesError, editingNoteId, editTitle, setEditTitle, editContent, setEditContent,
        deletingNoteId, handleDeleteNote, scheduleDocumentSave, saveStatus } = notesState;
    const editingNote = editingNoteId ? notes.find((note) => note.id === editingNoteId) : null;
    const changeDocument = (nextTitle, nextContent) => scheduleDocumentSave(editingNote.id, { title: nextTitle, content: nextContent });
    const format = (action) => { editorRef.current?.format(action); onFormat?.(action); };
    const statusText = saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Not saved — retry with your next edit" : "Saved";

    return <div className="flex h-full min-h-0 flex-col bg-[var(--bg-panel)]">
        {editingNote ? <>
            <div className="flex shrink-0 items-start gap-3 px-5 pb-2 pt-4">
                <div className="min-w-0 flex-1">
                    <input value={editTitle} maxLength={200} aria-label="Note title" placeholder="Untitled note"
                        onChange={(event) => { setEditTitle(event.target.value); changeDocument(event.target.value, editContent); }}
                        className="w-full bg-transparent font-serif text-lg font-semibold text-[var(--color-brand)] outline-none placeholder:text-[var(--text-muted)]" />
                    <p className="mt-0.5 text-[11px] text-[var(--text-muted)]" aria-live="polite">
                        {statusText}{editingNote.updated_at ? ` · ${formatNoteDate(editingNote.updated_at)}` : ""}
                    </p>
                </div>
                <button type="button" onClick={() => handleDeleteNote(editingNote.id)} disabled={deletingNoteId === editingNote.id}
                    className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--color-brand)] disabled:opacity-40">
                    {deletingNoteId === editingNote.id ? "Deleting…" : "Delete"}
                </button>
            </div>
            <NotesToolbar onFormat={format} />
            <div className="min-h-0 flex-1">
                <NotesEditor value={editContent} onChange={(content) => { setEditContent(content); changeDocument(editTitle, content); }}
                    placeholder="Write what you notice, what you wonder, or what you want to remember..." ariaLabel="Note content"
                    inputRef={editorRef} className="sm:text-[14px]" books={books} onReferenceClick={onReferenceClick} />
            </div>
        </> : <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <p className="font-serif text-lg font-semibold text-[var(--text-primary)]">Choose a note or create a new one</p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--text-muted)]">Your notes are independent documents and save automatically as you write.</p>
        </div>}
        {notesError && <div className="shrink-0 border-t border-[var(--color-brand)] bg-[var(--bg-surface)] px-5 py-3"><p className="text-xs leading-5 text-[var(--color-brand)]">{notesError}</p></div>}
    </div>;
}
