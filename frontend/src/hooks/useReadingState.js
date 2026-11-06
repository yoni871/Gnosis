import { useEffect } from "react";
import usePrivateSession from "./usePrivateSession";
import {
    getReadingState,
    saveReadingState,
} from "../services/readingStateService";

const DEFAULTS = {
    savedState: null,
    isLoading: false,
    error: "",
};

// Loads the logged-in reader's saved position (for the landing page's
// Continue button) and saves the current position as the reader moves.
// Pass null when there is no position to track (the landing page);
// pass the reader's position on the study page.
//
// The save is scoped by the token itself, so it always lands under the
// account that was reading. A failed save is silent: the next move
// retries, and the reader never blocks on it.
export default function useReadingState(position) {
    const {
        token,
        isAuthenticated,
        isAuthLoading,
        owner,
        state,
        field,
        capture,
        isCurrent,
    } = usePrivateSession(DEFAULTS);

    const savedState = state.savedState;
    const setSavedState = field("savedState");
    const setIsLoading = field("isLoading");
    const setError = field("error");

    // Load the saved position once per session. Guests and signed-out
    // readers have none, so there is nothing to load for them.
    useEffect(() => {
        if (isAuthLoading || !isAuthenticated || !token) return;

        const ticket = capture();
        let active = true;

        async function load() {
            setIsLoading(true);

            try {
                const data = await getReadingState(token);

                if (active && isCurrent(ticket)) {
                    setSavedState(data);
                }
            } catch (error) {
                if (active && isCurrent(ticket)) {
                    setError(error.message);
                }
            } finally {
                if (active && isCurrent(ticket)) {
                    setIsLoading(false);
                }
            }
        }

        load();

        return () => {
            active = false;
        };
    }, [owner, token, isAuthenticated, isAuthLoading, capture, isCurrent, setIsLoading, setSavedState, setError]);

    // The position as one comparable value: the object identity changes
    // every render, but the string only changes when the reader moves.
    const positionKey = position
        ? JSON.stringify([
            position.bookId ?? null,
            position.chapter ?? null,
            position.translation || "",
            position.commentaryId ?? null,
            position.verse ?? null,
        ])
        : null;

    // Save whenever the reader moves: a new chapter, translation,
    // commentary, or focused verse. Reads are cheap here (one indexed
    // upsert on our own database, no publisher call), so no debounce:
    // every move is saved as it happens, including the last one before
    // the reader leaves.
    useEffect(() => {
        if (!positionKey || !token) return;

        const [bookId, chapter, translation, commentaryId, verse] =
            JSON.parse(positionKey);

        if (!bookId || !chapter || !translation) return;

        saveReadingState(token, {
            bookId,
            chapter,
            translation,
            commentaryId,
            verse,
        }).catch(() => {
            // Silent: the next move retries.
        });
    }, [positionKey, token]);

    return {
        savedState,
        isLoading: state.isLoading,
        error: state.error,
    };
}
