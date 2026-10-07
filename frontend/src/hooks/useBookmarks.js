import { useContext, useEffect, useState, useRef } from "react";
import AuthContext from "../context/AuthContext";
import {
    getBookmarks,
    createBookmark,
    deleteBookmark
} from "../services/bookmarksService";

export default function useBookmarks() {
    const { token, isAuthenticated, isAuthLoading } = useContext(AuthContext);

    const [bookmarks, setBookmarks] = useState([]); //holds displayed bookmarks
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [isSaving, setIsSaving] = useState(false); //prevents repeated saves
    //let UI show sign in popup after a guest bookmarks a passage
    const [showLoginPrompt, setShowLoginPrompt] = useState(false); 
    // Track which bookmark is being removed so its button can show progress.
    const [deletingId, setDeletingId] = useState(null);
    //identify the current session so old requests cannot update a new session
    const sessionRef = useRef(0);

    useEffect(() => {
        //give this effect run a new session number
        sessionRef.current += 1;

        if(isAuthLoading) {
            return;
        }
        //clear bookmarks from the previous session
        setBookmarks([]);
        setError("");
        setIsLoading(false);

        //Reset action indicators and guest prompt for the new session
        setIsSaving(false);
        setDeletingId(null);
        setShowLoginPrompt(false);

        // Guests cannot request saved bookmarks from the protected API.
        if(!isAuthenticated || !token) {
            return;
        }

        let ignore = false;

        async function loadBookmarks() {
            setIsLoading(true);
            setError("");

            try {
                const data = await getBookmarks(token);

                if(!ignore) {
                    setBookmarks(data);
                }
            } catch (error) {
                if(!ignore) {
                    setError(error.message);
                }
            } finally {
                if(!ignore) {
                    setIsLoading(false);
                }
            }
        }

        loadBookmarks();

        return() => {
            //prevent the old loading request from updating state
            ignore = true;
            //invalidate save/delete requests when this session ends or we unmount
            sessionRef.current += 1;
        };
    }, [token, isAuthenticated, isAuthLoading]);


    // Find a bookmark that covers exactly the same book and passage range.
    function findBookmark(passage) {
        return bookmarks.find((bookmark) =>
            bookmark.book_id === passage.bookId &&
            bookmark.start_chapter === passage.startChapter &&
            bookmark.start_verse === passage.startVerse &&
            bookmark.end_chapter === passage.endChapter &&
            bookmark.end_verse === passage.endVerse
        );
    }

    //save a passage permanently for members or temporarily for guests
    async function handleAddBookmarks(passage) {
        //wait until auth and bookmark loading are finished
        if(isAuthLoading || isLoading || isSaving) {
            return;
        }

        setError("");

        //give feedback if the passage already exists
        if(findBookmark(passage)) {
            setError("This passage is already bookmarked.");
            return;
        }

        if(!isAuthenticated) {
            // Match the database field names so both bookmark types use the same UI.
            const guestBookmark = {
                // Prefer UUIDs; use a temporary local ID when testing over HTTP.
                id: typeof crypto.randomUUID === "function"
                    ? crypto.randomUUID()
                    : `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                book_id: passage.bookId,
                start_chapter: passage.startChapter,
                start_verse: passage.startVerse,
                end_chapter: passage.endChapter,
                end_verse: passage.endVerse,
                created_at: new Date().toISOString()
            };

            //react state keeps guest bookmarks only while this hook stays mounted.
            setBookmarks((current) => [guestBookmark, ...current]);
            setShowLoginPrompt(true);
            return;
        }

        if(!token) {
            setError("Please sign in again to save your bookmark.");
            return;
        }

        //remember which session started this request
        const session = sessionRef.current;

        setIsSaving(true);

        try {
            //the backend validates ownership and saves the passage
            const bookmark = await createBookmark(token, passage);
            //update the list only if we are still in the same session
            if(session === sessionRef.current) {
                //update the list directly instead of fetching every bookmark again.
                setBookmarks((current) => [bookmark, ...current]);
            }
        } catch (error) {
            //keep the list unchanged if saving fails.
            if(session === sessionRef.current) {
                setError(error.message);
            }
        } finally {
            //re enable saving after either success or failure
            if(session === sessionRef.current) {
                setIsSaving(false);
            }
        }
    }

    //remove a guest bookmark locally or a member's bookmark from the database
    async function handleDeleteBookmark(bookmarkId) {
        //wait for loading to finish allow only one removal at a time.
        if(isAuthLoading || isLoading || deletingId !== null) {
            return;
        }

        setError("");

        //guest bookmarks exist only in react state
        if(!isAuthenticated) {
            setBookmarks((current) =>
                current.filter((bookmark) => bookmark.id !== bookmarkId)
            );
            return;
        }

        //saved bookmarks require valid authentication token
        if(!token) {
            setError("Please sign in again to remove your bookmark.");
            return;
        }

        // Remember which session started this deletion.
        const session = sessionRef.current;

        setDeletingId(bookmarkId);

        try {
            // The backend checks ownership and removes the saved bookmark.
            await deleteBookmark(token, bookmarkId);

            // Update the displayed list only if the session has not changed.
            if (session === sessionRef.current) {
                setBookmarks((current) =>
                    current.filter((bookmark) => bookmark.id !== bookmarkId)
                );
            }
        } catch (error) {
            // Show the error only in the session that started the request.
            if (session === sessionRef.current) {
                setError(error.message);
            }
        } finally {
            // Avoid clearing another session's removal indicator.
            if (session === sessionRef.current) {
                setDeletingId(null);
            }
        }
    }

    // Expose bookmark data and actions to the component using this hook.
    return {
        bookmarks,
        isLoading,
        error,
        isSaving,
        deletingId,
        showLoginPrompt,
        setShowLoginPrompt,
        findBookmark,
        handleAddBookmarks,
        handleDeleteBookmark
    };
}
