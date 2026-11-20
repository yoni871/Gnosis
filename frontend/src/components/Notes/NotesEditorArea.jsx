import { useState } from "react";
import { formatNoteDate } from "./notesUtils";
import NotesEditor from "./NotesEditor";
import NotesToolbar from "./NotesToolbar";

export default function NotesEditorArea({ notesState, books, editorRef, onFormat, onReferenceClick }) {
    const [active, setActive] = useState({});
    const { notes, notesError, editingNoteId, documents, deletingNoteId, handleDeleteNote,
        changeDocument, saveDocument, cancelDocument } = notesState;
    const note = notes.find(item => item.id === editingNoteId);
    const doc = documents?.[editingNoteId];
    const dirty = doc && (doc.uncertain || doc.title !== doc.saved.title || doc.content !== doc.saved.content);
    const locked = doc?.saving || deletingNoteId === note?.id;
    const format = action => { editorRef.current?.format(action); onFormat?.(action); };
    const status = doc?.saving ? "Saving…" : doc?.error ? `Error: ${doc.error}` : dirty ? "Unsaved changes" : "Saved";

    return <div className="flex h-full min-h-0 flex-col bg-[var(--bg-panel)]">
        {note && doc ? <>
            <div className="flex shrink-0 items-start gap-3 px-5 pb-2 pt-4">
                <div className="min-w-0 flex-1">
                    <input value={doc.title} maxLength={200} aria-label="Note title" placeholder="Untitled note" disabled={locked}
                        onChange={event => changeDocument(note.id, { title: event.target.value })}
                        className="w-full bg-transparent font-serif text-lg font-semibold text-[var(--color-brand)] outline-none placeholder:text-[var(--text-muted)]" />
                    <p className="mt-0.5 text-[11px] text-[var(--text-muted)]" aria-live="polite">
                        {status}{!dirty && !doc.saving && !doc.error && note.updated_at ? ` · ${formatNoteDate(note.updated_at)}` : ""}
                    </p>
                </div>
                <button type="button" onClick={() => {
                    if (window.confirm(dirty ? "Delete this note and its unsaved changes?" : "Delete this note?")) handleDeleteNote(note.id);
                }} disabled={doc.saving || deletingNoteId === note.id}
                    className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--color-brand)] disabled:opacity-40">
                    {deletingNoteId === note.id ? "Deleting…" : "Delete"}
                </button>
            </div>
            <NotesToolbar onFormat={format} active={active} disabled={locked} />
            <div className="min-h-0 flex-1">
                <NotesEditor key={note.id} value={doc.content} onChange={content => changeDocument(note.id, { content })}
                    placeholder="Write what you notice, what you wonder, or what you want to remember..." ariaLabel="Note content"
                    inputRef={editorRef} className="sm:text-[14px]" books={books} onReferenceClick={onReferenceClick}
                    onFormatState={setActive} disabled={locked} />
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--border)] px-5 py-3">
                <p className="text-xs text-[var(--text-muted)]">Drafts stay here when you switch notes.</p>
                <div className="flex gap-2">
                    <button type="button" onClick={() => cancelDocument(note.id)} disabled={!dirty || locked}
                        className="rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-40">Cancel</button>
                    <button type="button" onClick={() => saveDocument(note.id)} disabled={!dirty || locked}
                        className="rounded-md bg-[var(--color-brand)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Save</button>
                </div>
            </div>
        </> : <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <p className="font-serif text-lg font-semibold text-[var(--text-primary)]">Choose a note or create a new one</p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--text-muted)]">Your notes are independent documents. Save your changes when you are ready.</p>
        </div>}
        {notesError && <div className="shrink-0 border-t border-[var(--color-brand)] bg-[var(--bg-surface)] px-5 py-3"><p className="text-xs leading-5 text-[var(--color-brand)]">{notesError}</p></div>}
    </div>;
}
