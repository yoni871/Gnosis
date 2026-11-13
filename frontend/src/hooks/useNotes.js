import { appendCollection, privatePage } from "../utils/privatePages";
import { useEffect, useRef } from "react";
import usePrivateSession from "./usePrivateSession";
import {
    createNote,
    deleteNote,
    getNotes,
    updateNote
} from "../services/notesService";

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
    editTitle: "",
    editContent: "",
    saveStatus: "saved",
    isUpdatingNote: false,
    deletingNoteId: null
};

export default function useNotes({
    book,
    chapter,
    selectedVerse,
    books
}) {
    const { token, isAuthenticated, isAuthLoading, owner, state, field, capture, isCurrent } = usePrivateSession(DEFAULTS);

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
    const editContent = state.editContent;
    const setEditContent = field("editContent");
    const editTitle = state.editTitle;
    const setEditTitle = field("editTitle");
    const setSaveStatus = field("saveStatus");
    const isUpdatingNote = state.isUpdatingNote;
    const setIsUpdatingNote = field("isUpdatingNote");

    // -------------------------
    // DELETE NOTE STATE
    // -------------------------

    const deletingNoteId = state.deletingNoteId;
    const setDeletingNoteId = field("deletingNoteId");
    const saveTimers = useRef(new Map());
    const pendingSaves = useRef(new Map());
    const revisions = useRef(new Map());
    const saveChains = useRef(new Map());
    const activeNoteId = useRef(editingNoteId);
    useEffect(() => { activeNoteId.current = editingNoteId; }, [editingNoteId]);

    const currentBook = books.find(
        (item) => item.name === book
    );

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

    // Save the captured draft passage, or the currently focused verse.
    async function handleSaveNote() {
        const ticket = capture();
        if (!ticket) return false;
        // Prevent empty notes, unauthenticated requests, and repeated saves.
        if (!token || isSavingNote || !noteContent.trim()) {
            return;
        }

        // Prefer the passage explicitly attached when the draft was started.
        const passage = draftPassage || (
            currentBook && selectedVerse
                ? {
                    bookId: currentBook.id,
                    startChapter: chapter,
                    startVerse: selectedVerse,
                    endChapter: chapter,
                    endVerse: selectedVerse
                }
                : null
        );

        // Capture the content and target submitted by this save.
        const content = noteContent.trim();

        setNotesError("");
        setIsSavingNote(true);

        try {
            const newNote = await createNote(token, {
                // Copy the passage coordinates into the request body.
                ...(passage || {}),
                content
            });

            if (!isCurrent(ticket)) return false;
            setNotes((currentNotes) => [
                newNote,
                ...currentNotes
            ]);

            // Reset the completed draft after the backend confirms success.
            setNoteContent("");
            setDraftPassage(null);
            return true;
        } catch (error) {
            if (!isCurrent(ticket)) return false;
            // Preserve the content and passage so the user can retry.
            setNotesError(error.message);
        } finally {
            if (isCurrent(ticket)) setIsSavingNote(false);
        }
    }

    // -------------------------
    // START EDITING
    // -------------------------

    function handleStartEdit(note) {
        if (!capture()) return false;
        if (editingNoteId && editingNoteId !== note.id) void flushDocumentSave(editingNoteId);
        setEditingNoteId(note.id);
        setEditTitle(note.title || "");
        setEditContent(note.content);
        setSaveStatus("saved");
        setNotesError("");
    }

    // -------------------------
    // CANCEL EDITING
    // -------------------------

    function handleCancelEdit() {
        if (!capture()) return false;
        setEditingNoteId(null);
        setEditTitle("");
        setEditContent("");
    }

    // -------------------------
    // UPDATE NOTE
    // -------------------------

    async function handleUpdateNote(noteId) {
        const ticket = capture();
        if (!ticket) return false;
        if (
            !token ||
            !editContent.trim()
        ) {
            return;
        }

        setNotesError("");
        setIsUpdatingNote(true);

        try {
            const updatedNote = await updateNote(
                token,
                noteId,
                {
                    content: editContent.trim()
                }
            );

            if (!isCurrent(ticket)) return false;
            setNotes((currentNotes) =>
                currentNotes.map((note) =>
                    note.id === noteId
                        ? updatedNote
                        : note
                )
            );

            setEditingNoteId(null);
            setEditContent("");
            return true;
        } catch (error) {
            if (!isCurrent(ticket)) return false;
            setNotesError(error.message);
        } finally {
            if (isCurrent(ticket)) setIsUpdatingNote(false);
        }
    }

    // -------------------------
    // DELETE NOTE
    // -------------------------

    async function handleDeleteNote(noteId) {
        const ticket = capture();
        if (!ticket) return false;
        if (!token) {
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

            if (editingNoteId === noteId) {
                clearTimeout(saveTimers.current.get(noteId));
                saveTimers.current.delete(noteId);
                pendingSaves.current.delete(noteId);
                setEditingNoteId(null);
                setEditTitle("");
                setEditContent("");
            }
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
        if (editingNoteId) await flushDocumentSave(editingNoteId);
        setIsSavingNote(true);
        setNotesError("");
        try {
            const note = await createNote(token, { ...(passage || {}), title: "", content: "<p></p>" });
            if (!isCurrent(ticket)) return null;
            setNotes((current) => [note, ...current]);
            setEditingNoteId(note.id);
            setEditTitle("");
            setEditContent(note.content);
            setSaveStatus("saved");
            return note;
        } catch (error) {
            if (isCurrent(ticket)) setNotesError(error.message);
            return null;
        } finally {
            if (isCurrent(ticket)) setIsSavingNote(false);
        }
    }

    async function persistDocument(noteId, draft, revision) {
        const previous = saveChains.current.get(noteId) || Promise.resolve();
        const save = previous.catch(() => {}).then(async () => {
            const ticket = capture();
            if (!ticket || !token) return false;
            try {
                const updated = await updateNote(token, noteId, draft);
                if (!isCurrent(ticket) || revisions.current.get(noteId) !== revision) return false;
                pendingSaves.current.delete(noteId);
                setNotes((current) => current.map((note) => note.id === noteId ? updated : note));
                if (activeNoteId.current === noteId) setSaveStatus("saved");
                return true;
            } catch (error) {
                if (isCurrent(ticket) && revisions.current.get(noteId) === revision) {
                    setNotesError(error.message);
                    if (activeNoteId.current === noteId) setSaveStatus("error");
                }
                return false;
            }
        });
        saveChains.current.set(noteId, save);
        return save.finally(() => {
            if (saveChains.current.get(noteId) === save) saveChains.current.delete(noteId);
        });
    }

    function scheduleDocumentSave(noteId, draft) {
        if (!noteId) return;
        const revision = (revisions.current.get(noteId) || 0) + 1;
        revisions.current.set(noteId, revision);
        pendingSaves.current.set(noteId, { draft, revision });
        setNotes((current) => current.map((note) => note.id === noteId ? { ...note, ...draft } : note));
        clearTimeout(saveTimers.current.get(noteId));
        setNotesError("");
        setSaveStatus("saving");
        saveTimers.current.set(noteId, setTimeout(() => {
            saveTimers.current.delete(noteId);
            void persistDocument(noteId, draft, revision);
        }, 650));
    }

    async function flushDocumentSave(noteId) {
        clearTimeout(saveTimers.current.get(noteId));
        saveTimers.current.delete(noteId);
        const pending = pendingSaves.current.get(noteId);
        return pending ? persistDocument(noteId, pending.draft, pending.revision) : true;
    }

    useEffect(() => {
        for (const timer of saveTimers.current.values()) clearTimeout(timer);
        saveTimers.current.clear();
        pendingSaves.current.clear();
        revisions.current.clear();
        saveChains.current.clear();
    }, [owner]);

    useEffect(() => () => {
        for (const timer of saveTimers.current.values()) clearTimeout(timer);
        for (const [noteId, pending] of pendingSaves.current) {
            void persistDocument(noteId, pending.draft, pending.revision);
        }
    // The latest draft refs are intentionally flushed only on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        editTitle,
        setEditTitle,
        editContent,
        setEditContent,
        isUpdatingNote,
        saveStatus: state.saveStatus,

        deletingNoteId,

        handleSaveNote,
        handleStartEdit,
        handleCancelEdit,
        handleUpdateNote,
        handleDeleteNote,
        handleCreateDocument,
        scheduleDocumentSave,
        flushDocumentSave,
        draftPassage,
        handleStartNote
    };
}
