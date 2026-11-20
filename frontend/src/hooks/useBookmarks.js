import usePassageCollection from "./usePassageCollection";
import { appendCollection, privatePage } from "../utils/privatePages";
import { useEffect } from "react";
import usePrivateSession from "./usePrivateSession";
import {
    getBookmarks,
    createBookmark,
    deleteBookmark
} from "../services/bookmarksService";

const DEFAULTS = {
    nextCursor: null,
    isLoadingMore: false,
    isContextLoading: false,
    bookmarks: [],
    isLoading: false,
    error: "",
    isSaving: false,
    showLoginPrompt: false,
    deletingId: null
};

export default function useBookmarks({ bookId, chapter } = {}) {
    const { token, isAuthenticated, isAuthLoading, owner, state, field, capture, isCurrent } = usePrivateSession(DEFAULTS);

    const setNextCursor = field("nextCursor");
    const setIsLoadingMore = field("isLoadingMore");
    async function loadMore() {
        if (!token || !state.nextCursor || state.isLoadingMore) return;
        const ticket = capture();
        if (!ticket) return;
        field("error")("");
        setIsLoadingMore(true);
        try {
            const page = privatePage(await getBookmarks(token, state.nextCursor));
            if (!isCurrent(ticket)) return;
            field("bookmarks")(current => appendCollection(current, page.items));
            setNextCursor(page.nextCursor);
        } catch (error) { if (isCurrent(ticket)) field("error")(error.message); }
        finally { if (isCurrent(ticket)) setIsLoadingMore(false); }
    }

    const bookmarks = state.bookmarks;
    const setBookmarks = field("bookmarks"); //holds displayed bookmarks
    const isLoading = state.isLoading || Boolean(bookId && state.isContextLoading);
    const setIsLoading = field("isLoading");
    const error = state.error;
    const setError = field("error");
    const isSaving = state.isSaving;
    const setIsSaving = field("isSaving"); //prevents repeated saves
    //let UI show sign in popup after a guest bookmarks a passage
    const showLoginPrompt = state.showLoginPrompt;
    const setShowLoginPrompt = field("showLoginPrompt");
    // Track which bookmark is being removed so its button can show progress.
    const deletingId = state.deletingId;
    const setDeletingId = field("deletingId");
    const setIsContextLoading = field("isContextLoading");
    usePassageCollection({ bookId, chapter, token, owner, isAuthenticated, isAuthLoading, capture, isCurrent,
        fetchPage: getBookmarks, setItems: setBookmarks, setLoading: setIsContextLoading,
        setError, maxPages: 20 });
    useEffect(() => {
        if (isAuthLoading || !isAuthenticated || !token) return;
        const ticket = capture();
        let active = true;
        async function load() {
            setIsLoading(true);
            try {
                const data = privatePage(await getBookmarks(token));
                if (active && isCurrent(ticket)) {
                    setBookmarks(current => appendCollection(current, data.items));
                    setNextCursor(data.nextCursor);
                }
            } catch (error) {
                if (active && isCurrent(ticket)) setError(error.message);
            } finally {
                if (active && isCurrent(ticket)) setIsLoading(false);
            }
        }
        load();
        return () => { active = false; };
    }, [owner, token, isAuthenticated, isAuthLoading, capture, isCurrent, setIsLoading, setBookmarks, setError, setNextCursor]);


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
        if (!capture()) return false;
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
        const ticket = capture();

        setIsSaving(true);

        try {
            //the backend validates ownership and saves the passage
            const bookmark = await createBookmark(token, passage);
            //update the list only if we are still in the same session
            if(isCurrent(ticket)) {
                //update the list directly instead of fetching every bookmark again.
                setBookmarks((current) => [bookmark, ...current]);
                return true;
            }
            return false;
        } catch (error) {
            //keep the list unchanged if saving fails.
            if(isCurrent(ticket)) {
                setError(error.message);
            }
            return false;
        } finally {
            //re enable saving after either success or failure
            if(isCurrent(ticket)) {
                setIsSaving(false);
            }
        }
    }

    //remove a guest bookmark locally or a member's bookmark from the database
    async function handleDeleteBookmark(bookmarkId) {
        if (!capture()) return false;
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
        const ticket = capture();

        setDeletingId(bookmarkId);

        try {
            // The backend checks ownership and removes the saved bookmark.
            await deleteBookmark(token, bookmarkId);

            // Update the displayed list only if the session has not changed.
            if (isCurrent(ticket)) {
                setBookmarks((current) =>
                    current.filter((bookmark) => bookmark.id !== bookmarkId)
                );
            }
        } catch (error) {
            // Show the error only in the session that started the request.
            if (isCurrent(ticket)) {
                setError(error.message);
            }
        } finally {
            // Avoid clearing another session's removal indicator.
            if (isCurrent(ticket)) {
                setDeletingId(null);
            }
        }
    }

    // Expose bookmark data and actions to the component using this hook.
    return {
        nextCursor: state.nextCursor, isLoadingMore: state.isLoadingMore, loadMore,
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
