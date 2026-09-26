import { useContext, useEffect, useState } from "react";

import AuthContext from "../../context/AuthContext";

import {
    createNote,
    deleteNote,
    getNotes,
    updateNote
} from "../../services/notesService";

import NotesHeader from "./NotesHeader";
import NoteComposer from "./NoteComposer";
import NotesList from "./NotesList";
import NotesLoggedOut from "./NotesLoggedOut";


export default function NotesPanel({
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


    // Find the current Bible book object.
    const currentBook = books.find(
        (item) => item.name === book
    );


    // -------------------------
    // LOAD NOTES
    // -------------------------

    useEffect(() => {
        if (!token) {
            setNotes([]);
            return;
        }

        async function loadNotes() {
            setIsLoadingNotes(true);
            setNotesError("");

            try {
                const data = await getNotes(token);

                setNotes(data);

            } catch (error) {
                setNotesError(error.message);

            } finally {
                setIsLoadingNotes(false);
            }
        }

        loadNotes();

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


            // Add the new note to the top
            // without re-fetching every note.
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


            // Replace only the updated note.
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
            await deleteNote(
                token,
                noteId
            );


            // Remove the deleted note locally.
            setNotes((currentNotes) =>
                currentNotes.filter(
                    (note) => note.id !== noteId
                )
            );


            // Leave edit mode if the note
            // being edited was deleted.
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


    // -------------------------
    // AUTH LOADING
    // -------------------------

    if (isAuthLoading) {
        return (
            <section
                className="
                    flex
                    h-full
                    items-center
                    justify-center
                    bg-[var(--bg-panel)]
                "
            >
                <div className="text-center">

                    <div
                        className="
                            mx-auto
                            mb-4
                            h-8
                            w-8
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
                            text-sm
                            italic
                            text-[var(--text-muted)]
                        "
                    >
                        Opening your journal...
                    </p>

                </div>
            </section>
        );
    }


    // -------------------------
    // LOGGED OUT
    // -------------------------

    if (!isAuthenticated) {
        return <NotesLoggedOut />;
    }


    // -------------------------
    // NOTES UI
    // -------------------------

    return (
        <section
            className="
                h-full
                overflow-y-auto
                bg-[var(--bg-panel)]
            "
        >
            <div
                className="
                    mx-auto
                    w-full
                    max-w-3xl
                    px-5
                    pb-16
                    pt-8
                    sm:px-8
                "
            >

                <NotesHeader
                    notesCount={notes.length}
                />


                <NoteComposer
                    book={book}
                    chapter={chapter}
                    selectedVerse={selectedVerse}

                    noteContent={noteContent}
                    setNoteContent={setNoteContent}

                    isSavingNote={isSavingNote}

                    onSave={handleSaveNote}
                />


                {/* Error message */}
                {notesError && (
                    <div
                        className="
                            mb-7
                            rounded-xl
                            border
                            border-[var(--color-brand)]
                            bg-[var(--bg-surface)]
                            px-5
                            py-4
                        "
                    >
                        <p
                            className="
                                text-xs
                                leading-5
                                text-[var(--color-brand)]
                            "
                        >
                            {notesError}
                        </p>
                    </div>
                )}


                <NotesList
                    notes={notes}
                    books={books}

                    isLoadingNotes={isLoadingNotes}
                    notesError={notesError}

                    editingNoteId={editingNoteId}

                    editContent={editContent}
                    setEditContent={setEditContent}

                    isUpdatingNote={isUpdatingNote}
                    deletingNoteId={deletingNoteId}

                    onStartEdit={handleStartEdit}
                    onCancelEdit={handleCancelEdit}
                    onUpdate={handleUpdateNote}
                    onDelete={handleDeleteNote}
                />

            </div>
        </section>
    );
}