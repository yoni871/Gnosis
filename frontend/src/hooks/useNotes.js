import { appendCollection, privatePage } from "../utils/privatePages";
import { useEffect, useRef } from "react";
import usePrivateSession from "./usePrivateSession";
import {
    createNote,
    deleteNote,
    getNotes,
    updateNote
} from "../services/notesService";

// Drafts survive an in-app route unmount, but never cross an auth session.
const documentDrafts = new Map();
const draftListeners = new Map();
let unloadGuardInstalled = false;
function hasUnsaved(documents) {
    return Object.values(documents || {}).some(doc => doc.saving || doc.uncertain || doc.title !== doc.saved.title || doc.content !== doc.saved.content);
}
function hasUnsavedDocuments() {
    return [...documentDrafts.values()].some(hasUnsaved);
}
function ensureUnloadGuard() {
    if (unloadGuardInstalled || typeof window === "undefined") return;
    window.addEventListener("beforeunload", event => {
        if (hasUnsavedDocuments()) { event.preventDefault(); event.returnValue = ""; }
    });
    window.addEventListener("gnosis:before-sign-out", event => {
        if (!hasUnsavedDocuments()) return;
        if (event.detail?.forced) {
            window.alert("Your session has expired. Unsaved note drafts could not be saved.");
        } else if (!window.confirm("You have unsaved note drafts. Sign out and discard them?")) {
            event.preventDefault();
            return;
        }
        documentDrafts.clear();
    });
    unloadGuardInstalled = true;
}

const DEFAULTS = {
    nextCursor: null,
    isLoadingMore: false,
    isContextLoading: false,
    notes: [],
    isLoadingNotes: false,
    notesError: "",
    noteContent: "",
    isSavingNote: false,
    draftPassage: null,
    editingNoteId: null,
    documents: {},
    deletingNoteId: null
};

export default function useNotes() {
    const { token, isAuthenticated, isAuthLoading, owner, state, field, capture, isCurrent, setCurrent } = usePrivateSession(DEFAULTS);

    const setNextCursor = field("nextCursor");
    const setIsLoadingMore = field("isLoadingMore");
    async function loadMore() {
        if (!token || !state.nextCursor || state.isLoadingMore) return;
        const ticket = capture();
        if (!ticket) return;
        field("notesError")("");
        setIsLoadingMore(true);
        try {
            const page = privatePage(await getNotes(token, state.nextCursor));
            if (!isCurrent(ticket)) return;
            field("notes")(current => appendCollection(current, page.items));
            setNextCursor(page.nextCursor);
        } catch (error) { if (isCurrent(ticket)) field("notesError")(error.message); }
        finally { if (isCurrent(ticket)) setIsLoadingMore(false); }
    }

    // -------------------------
    // NOTES STATE
    // -------------------------

    const notes = state.notes;
    const setNotes = field("notes");
    const isLoadingNotes = state.isLoadingNotes;
    const setIsLoadingNotes = field("isLoadingNotes");
    const notesError = state.notesError;
    const setNotesError = field("notesError");

    // -------------------------
    // CREATE NOTE STATE
    // -------------------------

    const noteContent = state.noteContent;
    const setNoteContent = field("noteContent");
    const isSavingNote = state.isSavingNote;
    const setIsSavingNote = field("isSavingNote");

    // Keep a note's target separate from the verse currently being viewed.
    const draftPassage = state.draftPassage;
    const setDraftPassage = field("draftPassage");

    // -------------------------
    // EDIT NOTE STATE
    // -------------------------

    const editingNoteId = state.editingNoteId;
    const setEditingNoteId = field("editingNoteId");

    // -------------------------
    // DELETE NOTE STATE
    // -------------------------

    const deletingNoteId = state.deletingNoteId;
    const setDeletingNoteId = field("deletingNoteId");
    const activeNoteId = useRef(editingNoteId);
    const ownerRef = useRef(owner);
    const draftRef = useRef(null);
    if (!draftRef.current) draftRef.current = documentDrafts.get(owner) || {};

    // -------------------------
    // LOAD NOTES
    // -------------------------

    useEffect(() => {
        if (isAuthLoading || !isAuthenticated || !token) return;
        const ticket = capture();
        let active = true;
        async function load() {
            setIsLoadingNotes(true);
            try {
                const data = privatePage(await getNotes(token));
                if (active && isCurrent(ticket)) {
                    setNotes(current => appendCollection(current, data.items));
                    setNextCursor(data.nextCursor);
                }
            } catch (error) {
                if (active && isCurrent(ticket)) setNotesError(error.message);
            } finally {
                if (active && isCurrent(ticket)) setIsLoadingNotes(false);
            }
        }
        load();
        return () => { active = false; };
    }, [owner, token, isAuthenticated, isAuthLoading, capture, isCurrent, setIsLoadingNotes, setNotes, setNotesError, setNextCursor]);

    // -------------------------
    // CREATE NOTE
    // -------------------------

    // Start a note for a passage supplied by another feature, such as Highlights.
    function handleStartNote(passage) {
        if (!capture()) return false;
        // Preserve an existing draft instead of silently replacing its target.
        if (noteContent.trim() || isSavingNote) {
            setNotesError("Save your current note before starting another.");
            return false;
        }

        // Copy the coordinates so the draft owns its passage.
        setDraftPassage({
            bookId: passage.bookId,
            startChapter: passage.startChapter,
            startVerse: passage.startVerse,
            endChapter: passage.endChapter,
            endVerse: passage.endVerse
        });

        setNotesError("");
        return true;
    }

    // -------------------------
    // START EDITING
    // -------------------------

    function handleStartEdit(note) {
        if (!capture()) return false;
        activeNoteId.current = note.id;
        const doc = draftRef.current[note.id] || makeDocument(note);
        publishDocuments({ ...draftRef.current, [note.id]: doc });
        setCurrent(current => ({ ...current, editingNoteId: note.id, notesError: "" }));
    }

    // -------------------------
    // DELETE NOTE
    // -------------------------

    async function handleDeleteNote(noteId) {
        const ticket = capture();
        if (!ticket) return false;
        if (!token || draftRef.current[noteId]?.saving) {
            return;
        }

        setNotesError("");
        setDeletingNoteId(noteId);

        try {
            await deleteNote(token, noteId);

            if (!isCurrent(ticket)) return false;
            setNotes((currentNotes) =>
                currentNotes.filter(
                    (note) => note.id !== noteId
                )
            );

            if (activeNoteId.current === noteId) {
                activeNoteId.current = null;
                setEditingNoteId(null);
            }
            const next = { ...draftRef.current };
            delete next[noteId];
            publishDocuments(next);
            return true;
        } catch (error) {
            if (!isCurrent(ticket)) return false;
            setNotesError(error.message);
        } finally {
            if (isCurrent(ticket)) setDeletingNoteId(null);
        }
    }

    async function handleCreateDocument(passage = null) {
        const ticket = capture();
        if (!ticket || !token || isSavingNote) return null;
        const selectedAtStart = activeNoteId.current;
        setIsSavingNote(true);
        setNotesError("");
        try {
            const note = await createNote(token, { ...(passage || {}), title: "", content: "<p></p>" });
            if (!isCurrent(ticket)) return null;
            setNotes((current) => [note, ...current]);
            if (activeNoteId.current === selectedAtStart) handleStartEdit(note);
            return note;
        } catch (error) {
            if (isCurrent(ticket)) setNotesError(error.message);
            return null;
        } finally {
            if (isCurrent(ticket)) setIsSavingNote(false);
        }
    }

    function makeDocument(note) {
        const saved = { title: note.title || "", content: note.content || "" };
        return { ...saved, saved, saving: false, error: "", uncertain: false };
    }

    function publishDocuments(documents) {
        ensureUnloadGuard();
        draftRef.current = documents;
        documentDrafts.set(owner, documents);
        for (const listener of draftListeners.get(owner) || []) listener(documents);
    }

    function changeDocument(noteId, change) {
        if (!capture() || activeNoteId.current !== noteId) return;
        const doc = draftRef.current[noteId];
        if (!doc || doc.saving || deletingNoteId === noteId) return;
        const next = { ...doc, ...change, error: "" };
        publishDocuments({ ...draftRef.current, [noteId]: next });
    }

    async function saveDocument(noteId) {
        const ticket = capture();
        const doc = draftRef.current[noteId];
        if (!ticket || !token || !doc || doc.saving || deletingNoteId === noteId) return false;
        const submitted = { title: doc.title, content: doc.content };
        publishDocuments({ ...draftRef.current, [noteId]: { ...doc, saving: true, error: "" } });
        try {
            const updated = await updateNote(token, noteId, submitted);
            const cached = documentDrafts.get(owner);
            const current = cached?.[noteId];
            if (!current) return false;
            const saved = { title: updated.title || "", content: updated.content || "" };
            publishDocuments({ ...cached, [noteId]: { ...current, ...saved, saved, saving: false, error: "", uncertain: false } });
            if (isCurrent(ticket)) setNotes(items => items.map(item => item.id === noteId ? updated : item));
            return true;
        } catch (error) {
            const cached = documentDrafts.get(owner);
            if (cached?.[noteId]) {
                publishDocuments({ ...cached, [noteId]: { ...cached[noteId], saving: false, error: error.message, uncertain: true } });
            }
            return false;
        }
    }

    async function cancelDocument(noteId) {
        const doc = draftRef.current[noteId];
        const ticket = capture();
        if (!ticket || !doc || doc.saving || deletingNoteId === noteId) return;
        // A failed request may have committed before its response was lost. Restore
        // the confirmed snapshot on the server before declaring cancellation complete.
        if (doc.uncertain) {
            publishDocuments({ ...draftRef.current, [noteId]: { ...doc, saving: true, error: "" } });
            try {
                const updated = await updateNote(token, noteId, doc.saved);
                const cached = documentDrafts.get(owner);
                if (!cached?.[noteId]) return;
                const saved = { title: updated.title || "", content: updated.content || "" };
                publishDocuments({ ...cached, [noteId]: { ...cached[noteId], ...saved, saved, saving: false, error: "", uncertain: false } });
                if (isCurrent(ticket)) setNotes(items => items.map(item => item.id === noteId ? updated : item));
            } catch (error) {
                const cached = documentDrafts.get(owner);
                if (cached?.[noteId]) publishDocuments({ ...cached, [noteId]: { ...cached[noteId], saving: false, error: error.message, uncertain: true } });
            }
            return;
        }
        publishDocuments({ ...draftRef.current, [noteId]: { ...doc, ...doc.saved, error: "" } });
    }

    useEffect(() => {
        if (ownerRef.current !== owner) {
            if (hasUnsaved(documentDrafts.get(ownerRef.current))) {
                window.alert("Your sign-in changed. Unsaved note drafts from the previous session could not be saved.");
            }
            documentDrafts.delete(ownerRef.current);
            ownerRef.current = owner;
            draftRef.current = documentDrafts.get(owner) || {};
            activeNoteId.current = null;
        }
    }, [owner]);

    useEffect(() => {
        const listeners = draftListeners.get(owner) || new Set();
        const listener = documents => { draftRef.current = documents; field("documents")(documents); };
        listeners.add(listener);
        draftListeners.set(owner, listeners);
        if (Object.keys(draftRef.current).length) listener(draftRef.current);
        return () => { listeners.delete(listener); if (!listeners.size) draftListeners.delete(owner); };
    }, [owner, field]);

    return {
        nextCursor: state.nextCursor, isLoadingMore: state.isLoadingMore, loadMore,
        isAuthenticated,
        isAuthLoading,

        notes,
        isLoadingNotes,
        notesError,

        noteContent,
        setNoteContent,
        isSavingNote,

        editingNoteId,
        documents: state.documents,

        deletingNoteId,

        handleStartEdit,
        handleDeleteNote,
        handleCreateDocument,
        changeDocument,
        saveDocument,
        cancelDocument,
        draftPassage,
        handleStartNote
    };
}
