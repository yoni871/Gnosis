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

    async function handleSaveNote() {
        if (
            !token ||
            !currentBook ||
            !selectedVerse ||
            !noteContent.trim()
        ) {
            return;
        }

        setNotesError("");
        setIsSavingNote(true);

        const noteData = {
            bookId: currentBook.id,

            startChapter: chapter,
            startVerse: selectedVerse,

            endChapter: chapter,
            endVerse: selectedVerse,

            content: noteContent.trim()
        };

        try {
            const newNote = await createNote(
                token,
                noteData
            );

            setNotes((currentNotes) => [
                newNote,
                ...currentNotes
            ]);

            setNoteContent("");
        } catch (error) {
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
        handleDeleteNote
    };
}