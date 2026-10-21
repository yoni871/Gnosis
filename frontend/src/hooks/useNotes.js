import { useContext, useEffect, useState } from "react";
import AuthContext from "../context/AuthContext";
import {
    createNote,
    deleteNote,
    getNotes,
    updateNote
} from "../services/notesService";

export default function useNotes({
    book,
    chapter,
    selectedVerse,
    books
}) {
    const {
        token,
        isAuthenticated,
        isAuthLoading
    } = useContext(AuthContext);

    // -------------------------
    // NOTES STATE
    // -------------------------

    const [notes, setNotes] = useState([]);
    const [isLoadingNotes, setIsLoadingNotes] = useState(false);
    const [notesError, setNotesError] = useState("");

    // -------------------------
    // CREATE NOTE STATE
    // -------------------------

    const [noteContent, setNoteContent] = useState("");
    const [isSavingNote, setIsSavingNote] = useState(false);

    // Keep a note's target separate from the verse currently being viewed.
    const [draftPassage, setDraftPassage] = useState(null);

    // -------------------------
    // EDIT NOTE STATE
    // -------------------------

    const [editingNoteId, setEditingNoteId] = useState(null);
    const [editContent, setEditContent] = useState("");
    const [isUpdatingNote, setIsUpdatingNote] = useState(false);

    // -------------------------
    // DELETE NOTE STATE
    // -------------------------

    const [deletingNoteId, setDeletingNoteId] = useState(null);

    const currentBook = books.find(
        (item) => item.name === book
    );

    // -------------------------
    // LOAD NOTES
    // -------------------------

    useEffect(() => {
        if (!token) {
            setNotes([]);
            setNotesError("");
            setIsLoadingNotes(false);
            return;
        }

        let ignoreResponse = false;

        async function loadNotes() {
            setIsLoadingNotes(true);
            setNotesError("");

            try {
                const data = await getNotes(token);

                if (!ignoreResponse) {
                    setNotes(data);
                }
            } catch (error) {
                if (!ignoreResponse) {
                    setNotesError(error.message);
                }
            } finally {
                if (!ignoreResponse) {
                    setIsLoadingNotes(false);
                }
            }
        }

        loadNotes();

        return () => {
            ignoreResponse = true;
        };
    }, [token]);

    // -------------------------
    // CREATE NOTE
    // -------------------------

    // Start a note for a passage supplied by another feature, such as Highlights.
    function handleStartNote(passage) {
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

        if (!passage) {
            setNotesError("Select a passage before saving your note.");
            return;
        }

        // Capture the content and target submitted by this save.
        const content = noteContent.trim();

        setNotesError("");
        setIsSavingNote(true);

        try {
            const newNote = await createNote(token, {
                // Copy the passage coordinates into the request body.
                ...passage,
                content
            });

            setNotes((currentNotes) => [
                newNote,
                ...currentNotes
            ]);

            // Reset the completed draft after the backend confirms success.
            setNoteContent("");
            setDraftPassage(null);
        } catch (error) {
            // Preserve the content and passage so the user can retry.
            setNotesError(error.message);
        } finally {
            setIsSavingNote(false);
        }
    }

    // -------------------------
    // START EDITING
    // -------------------------

    function handleStartEdit(note) {
        setEditingNoteId(note.id);
        setEditContent(note.content);
        setNotesError("");
    }

    // -------------------------
    // CANCEL EDITING
    // -------------------------

    function handleCancelEdit() {
        setEditingNoteId(null);
        setEditContent("");
    }

    // -------------------------
    // UPDATE NOTE
    // -------------------------

    async function handleUpdateNote(noteId) {
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

            setNotes((currentNotes) =>
                currentNotes.map((note) =>
                    note.id === noteId
                        ? updatedNote
                        : note
                )
            );

            setEditingNoteId(null);
            setEditContent("");
        } catch (error) {
            setNotesError(error.message);
        } finally {
            setIsUpdatingNote(false);
        }
    }

    // -------------------------
    // DELETE NOTE
    // -------------------------

    async function handleDeleteNote(noteId) {
        if (!token) {
            return;
        }

        setNotesError("");
        setDeletingNoteId(noteId);

        try {
            await deleteNote(token, noteId);

            setNotes((currentNotes) =>
                currentNotes.filter(
                    (note) => note.id !== noteId
                )
            );

            if (editingNoteId === noteId) {
                setEditingNoteId(null);
                setEditContent("");
            }
        } catch (error) {
            setNotesError(error.message);
        } finally {
            setDeletingNoteId(null);
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