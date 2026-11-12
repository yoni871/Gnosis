import { useEffect } from "react";
import usePrivateSession from "./usePrivateSession";
import {
    createNote,
    deleteNote,
    getNotes,
    updateNote
} from "../services/notesService";

const DEFAULTS = {
    notes: [],
    isLoadingNotes: false,
    notesError: "",
    noteContent: "",
    isSavingNote: false,
    draftPassage: null,
    editingNoteId: null,
    editContent: "",
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
    const isUpdatingNote = state.isUpdatingNote;
    const setIsUpdatingNote = field("isUpdatingNote");

    // -------------------------
    // DELETE NOTE STATE
    // -------------------------

    const deletingNoteId = state.deletingNoteId;
    const setDeletingNoteId = field("deletingNoteId");

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
                const data = await getNotes(token);
                if (active && isCurrent(ticket)) setNotes(data);
            } catch (error) {
                if (active && isCurrent(ticket)) setNotesError(error.message);
            } finally {
                if (active && isCurrent(ticket)) setIsLoadingNotes(false);
            }
        }
        load();
        return () => { active = false; };
    }, [owner, token, isAuthenticated, isAuthLoading, capture, isCurrent, setIsLoadingNotes, setNotes, setNotesError]);

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
        setEditingNoteId(note.id);
        setEditContent(note.content);
        setNotesError("");
    }

    // -------------------------
    // CANCEL EDITING
    // -------------------------

    function handleCancelEdit() {
        if (!capture()) return false;
        setEditingNoteId(null);
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
                setEditingNoteId(null);
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

    return {
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
        draftPassage,
        handleStartNote
    };
}
