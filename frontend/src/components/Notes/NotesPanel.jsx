import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Library, Plus, Search, Trash2, X } from "lucide-react";
import NotesLoggedOut from "./NotesLoggedOut";
import RichTextEditor from "./RichTextEditor";
import { plainText, sanitizeRichText } from "./notesContent";
import { parseScriptureMentions } from "./scriptureMentions";
import ScripturePreviewSheet from "./ScripturePreviewSheet";

const titleFor = (note) => note.title || plainText(note.content).trim().split(/\n/)[0].slice(0, 48) || "Untitled note";

function Editor({ note, books, saveDocument, openReference }) {
    const [title, setTitle] = useState(note.title || "");
    const [content, setContent] = useState(note.content || "");
    const [saveStatus, setSaveStatus] = useState("Saved");
    const saveTimer = useRef(null);
    const references = useMemo(() => parseScriptureMentions(plainText(content), books).filter((part) => part.type === "reference"), [content, books]);
    const queueSave = (nextTitle, nextContent) => {
        setSaveStatus("Saving…");
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => setSaveStatus(await saveDocument(note.id, nextTitle, sanitizeRichText(nextContent)) ? "Saved" : "Couldn’t save"), 700);
    };
    useEffect(() => () => clearTimeout(saveTimer.current), []);
    return <>
        <div className="sr-only" aria-live="polite">{saveStatus}</div>
        <input aria-label="Note title" value={title} maxLength={200} placeholder="Untitled note" onChange={(event) => { setTitle(event.target.value); queueSave(event.target.value, content); }} className="w-full bg-transparent px-7 pb-4 pt-7 font-serif text-2xl font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]" />
        <RichTextEditor value={content} onChange={(next) => { setContent(next); queueSave(title, next); }} onBlur={() => queueSave(title, content)} />
        {references.length > 0 && <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--border)] px-6 py-3 text-xs"><span className="text-[var(--text-muted)]">References</span>{references.map((ref, index) => <button key={`${ref.text}-${index}`} onClick={() => openReference(ref)} className="rounded-full border border-[var(--color-accent)] px-2.5 py-1 font-serif font-semibold text-[var(--color-brand)] underline">{ref.text}</button>)}</div>}
    </>;
}

export default function NotesPanel({ books, notesState, navigateToPassage, mobile = false, translation }) {
    const { isAuthenticated, isAuthLoading, notes, isLoadingNotes, notesError, nextCursor, isLoadingMore, loadMore,
        createDocument, saveDocument, handleDeleteNote } = notesState;
    const [activeId, setActiveId] = useState(null);
    const [libraryOpen, setLibraryOpen] = useState(true);
    const [query, setQuery] = useState("");
    const [sheetReference, setSheetReference] = useState(null);
    const selectedId = notes.some((note) => note.id === activeId) ? activeId : notes[0]?.id ?? null;
    const active = notes.find((note) => note.id === selectedId) || null;

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return needle ? notes.filter((note) => `${titleFor(note)} ${plainText(note.content)}`.toLowerCase().includes(needle)) : notes;
    }, [notes, query]);
    const newNote = async () => {
        const note = await createDocument();
        if (note) { setActiveId(note.id); setLibraryOpen(false); }
    };
    const openReference = (reference) => mobile ? setSheetReference(reference) : navigateToPassage(reference);

    if (isAuthLoading) return <div className="flex h-full items-center justify-center font-serif italic text-[var(--text-muted)]">Opening your notes…</div>;
    if (!isAuthenticated) return <NotesLoggedOut />;

    return <section className="relative flex h-full overflow-hidden bg-[var(--bg-panel)]">
        <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 sm:px-6">
                {mobile && libraryOpen ? null : <button type="button" onClick={() => setLibraryOpen(true)} aria-label="Open notes library" className="rounded-lg p-2 hover:bg-[var(--hover-bg)]"><Library size={19} /></button>}
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[var(--text-primary)]">{active ? titleFor(active) : "Notes"}</p><p className="text-[10px] text-[var(--text-muted)]">Private · autosaved</p></div>
                <button type="button" onClick={newNote} className="flex items-center gap-2 rounded-full bg-[var(--color-brand)] px-4 py-2 text-xs font-semibold text-white"><Plus size={15} /> New</button>
            </header>
            {active ? <Editor key={active.id} note={active} books={books} saveDocument={saveDocument} openReference={openReference} /> : <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><h2 className="font-serif text-2xl text-[var(--text-primary)]">Your notes, gathered</h2><p className="mt-2 text-sm text-[var(--text-muted)]">Create a note or choose one from your library.</p><button onClick={newNote} className="mt-6 rounded-full bg-[var(--color-brand)] px-5 py-2.5 text-sm font-semibold text-white">Create a note</button></div>}
        </div>
        <aside className={`${libraryOpen ? "translate-x-0" : "translate-x-full"} absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l border-[var(--border)] bg-[var(--bg-surface)] shadow-xl transition-transform duration-300 sm:w-[min(23rem,92%)]`}>
            <header className="flex h-16 items-center gap-3 border-b border-[var(--border)] px-5"><button onClick={() => setLibraryOpen(false)} aria-label="Close notes library" className="rounded-lg p-2 hover:bg-[var(--hover-bg)]">{mobile ? <ChevronLeft size={20} /> : <X size={20} />}</button><h2 className="flex-1 font-serif text-xl font-semibold">Notes</h2><button onClick={newNote} aria-label="Create note" className="rounded-full bg-[var(--color-brand)] p-2 text-white"><Plus size={17} /></button></header>
            <label className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3"><Search size={16} className="text-[var(--text-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" /></label>
            {notesError && <p className="px-5 pt-3 text-xs text-[var(--color-brand)]">{notesError}</p>}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">{isLoadingNotes ? <p className="p-5 text-sm italic text-[var(--text-muted)]">Gathering your notes…</p> : filtered.map((note) => <article key={note.id} className={`group relative mb-1 rounded-xl border ${selectedId === note.id ? "border-[var(--color-accent)] bg-[var(--bg-selected)]" : "border-transparent hover:bg-[var(--hover-bg)]"}`}>
                <button className="w-full px-4 py-3 text-left" onClick={() => { setActiveId(note.id); setLibraryOpen(false); }}><h3 className="truncate font-serif font-semibold text-[var(--text-primary)]">{titleFor(note)}</h3><div className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">{plainText(note.content)}</div></button>
                <button aria-label={`Delete ${titleFor(note)}`} onClick={() => handleDeleteNote(note.id)} className="absolute right-3 top-3 rounded p-1.5 text-[var(--text-muted)] opacity-0 hover:text-red-700 group-hover:opacity-100 focus:opacity-100"><Trash2 size={15} /></button>
            </article>)}</div>
            {nextCursor && <button onClick={loadMore} disabled={isLoadingMore} className="m-4 rounded-full border border-[var(--border)] py-2 text-xs font-semibold">{isLoadingMore ? "Loading…" : "Load more notes"}</button>}
        </aside>
        <ScripturePreviewSheet reference={sheetReference} translation={translation} onClose={() => setSheetReference(null)} onOpen={(ref) => { setSheetReference(null); navigateToPassage(ref); }} />
    </section>;
}
