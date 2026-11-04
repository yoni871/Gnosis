import { useEffect } from "react";
import usePrivateSession from "./usePrivateSession";
import { mergeHighlights, createGuestHighlights, isHighlightSelected } from "../utils/highlightUtils";
import {
    getHighlights,
    saveHighlights,
    clearHighlights
} from "../services/highlightsService";

const DEFAULTS = {
    highlights: [],
    isLoading: false,
    isSaving: false,
    error: "",
    showLoginPrompt: false
};

export default function useHighlights() {
    // Read the current authentication session.
    const { token, isAuthenticated, isAuthLoading, owner, state, field, capture, isCurrent } = usePrivateSession(DEFAULTS);

    // Share highlighted verse records across the Study page.
    const highlights = state.highlights;
    const setHighlights = field("highlights");

    // Separate initial loading from save/remove actions.
    const isLoading = state.isLoading;
    const setIsLoading = field("isLoading");
    const isSaving = state.isSaving;
    const setIsSaving = field("isSaving");
    const error = state.error;
    const setError = field("error");

    // Encourage guests to sign in after a temporary highlight.
    const showLoginPrompt = state.showLoginPrompt;
    const setShowLoginPrompt = field("showLoginPrompt");

    useEffect(() => {
        if (isAuthLoading || !isAuthenticated || !token) return;
        const ticket = capture();
        let active = true;
        async function load() {
            setIsLoading(true);
            try {
                const data = await getHighlights(token);
                if (active && isCurrent(ticket)) setHighlights(data);
            } catch (error) {
                if (active && isCurrent(ticket)) setError(error.message);
            } finally {
                if (active && isCurrent(ticket)) setIsLoading(false);
            }
        }
        load();
        return () => { active = false; };
    }, [owner, token, isAuthenticated, isAuthLoading, capture, isCurrent, setIsLoading, setHighlights, setError]);

    // Apply a color and report whether the operation succeeded.
    async function handleSaveHighlights(selection, color) {
        if (!capture()) return false;
        const { bookId, verses: selectedVerses } = selection;

        // Report that no save happened while another operation is running.
        if (isAuthLoading || isLoading || isSaving) {
            return false;
        }

        setError("");

        // Validate the selection for both guests and signed-in users.
        if (!Array.isArray(selectedVerses) || selectedVerses.length === 0) {
            setError("Select at least one verse to highlight.");
            return false;
        }

        // Guests also need validation because they do not call the backend.
        if (
            typeof color !== "string" ||
            !/^#[0-9A-Fa-f]{6}$/.test(color)
        ) {
            setError("Choose a valid six-digit hex color.");
            return false;
        }

        if (!isAuthenticated) {
            // Create and display temporary guest highlights.
            const guestHighlights = createGuestHighlights(
                bookId,
                selectedVerses,
                color
            );

            setHighlights((current) =>
                mergeHighlights(current, guestHighlights)
            );

            setShowLoginPrompt(true);

            // The local operation succeeded.
            return true;
        }

        if (!token) {
            setError("Please sign in again to save your highlights.");
            return false;
        }

        // Remember the session that started this request.
        const ticket = capture();
        setIsSaving(true);

        try {
            const saved = await saveHighlights(
                token,
                bookId,
                selectedVerses,
                color
            );

            // An old session must not report success to the current UI.
            if (!isCurrent(ticket)) {
                return false;
            }

            setHighlights((current) =>
                mergeHighlights(current, saved)
            );

            // The backend confirmed the save.
            return true;
        } catch (error) {
            if (isCurrent(ticket)) {
                setError(error.message);
            }

            // Keep the selection available for retrying.
            return false;
        } finally {
            // This still runs before the function finishes returning.
            if (isCurrent(ticket)) {
                setIsSaving(false);
            }
        }
    }

    // Remove highlights from the selected passage.
    async function handleClearHighlights(selection) {
        if (!capture()) return false;
        // Allow actions only after loading and any previous action finish.
        if (isAuthLoading || isLoading || isSaving) {
            return;
        }

        setError("");

        // Require selected coordinates before attempting either storage path.
        if (!Array.isArray(selection.verses) || selection.verses.length === 0) {
            setError("Select at least one verse to clear.");
            return;
        }

        if (!isAuthenticated) {
            // Keep every guest highlight except those explicitly selected.
            setHighlights((current) =>
                current.filter((highlight) =>
                    !isHighlightSelected(highlight, selection)
                )
            );
            return;
        }

        if (!token) {
            setError("Please sign in again to clear your highlights.");
            return;
        }

        const ticket = capture();
        setIsSaving(true);

        try {
            // Ask the backend to clear only this exact verse collection.
            const { removedIds } = await clearHighlights(
                token,
                selection.bookId,
                selection.verses
            );

            if (isCurrent(ticket)) {
                // Use a Set for checking whether each record was removed.
                const removed = new Set(removedIds);

                setHighlights((current) =>
                    current.filter((highlight) => !removed.has(highlight.id))
                );
            }
        } catch (error) {
            if (isCurrent(ticket)) {
                setError(error.message);
            }
        } finally {
            if (isCurrent(ticket)) {
                setIsSaving(false);
            }
        }
    }

    // Expose shared highlight data, status, and actions to the Study page.
    return {
        highlights,
        isLoading,
        isSaving,
        error,
        showLoginPrompt,
        setShowLoginPrompt,
        handleSaveHighlights,
        handleClearHighlights
    };
}
