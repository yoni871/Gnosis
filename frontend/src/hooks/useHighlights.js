import { useContext, useEffect, useRef, useState } from "react";
import AuthContext from "../context/AuthContext";
import { mergeHighlights, createGuestHighlights, isHighlightSelected } from "../utils/highlightUtils";
import {
    getHighlights,
    saveHighlights,
    clearHighlights
} from "../services/highlightsService";

export default function useHighlights() {
    // Read the current authentication session.
    const { token, isAuthenticated, isAuthLoading } = useContext(AuthContext);

    // Share highlighted verse records across the Study page.
    const [highlights, setHighlights] = useState([]);

    // Separate initial loading from save/remove actions.
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");

    // Encourage guests to sign in after a temporary highlight.
    const [showLoginPrompt, setShowLoginPrompt] = useState(false);

    // Invalidate delayed responses when the authentication session changes.
    const sessionRef = useRef(0);

    useEffect(() => {
        // Give this effect run its own session number.
        const session = ++sessionRef.current;

        // Remove data and feedback left over from the previous session.
        setHighlights([]);
        setError("");
        setIsLoading(false);
        setIsSaving(false);
        setShowLoginPrompt(false);

        async function loadHighlights() {
            // Guests use temporary state and must not call the protected API.
            if (isAuthLoading || !isAuthenticated || !token) {
                return;
            }

            setIsLoading(true);

            try {
                const data = await getHighlights(token);

                // Accept the response only if this session is still current.
                if (session === sessionRef.current) {
                    setHighlights(data);
                }
            } catch (error) {
                if (session === sessionRef.current) {
                    setError(error.message);
                }
            } finally {
                if (session === sessionRef.current) {
                    setIsLoading(false);
                }
            }
        }

        loadHighlights();

        return () => {
            // Invalidate pending responses when dependencies change or we unmount.
            sessionRef.current += 1;
        };
    }, [token, isAuthenticated, isAuthLoading]);

    // Apply a color and report whether the operation succeeded.
    async function handleSaveHighlights(selection, color) {
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
        const session = sessionRef.current;
        setIsSaving(true);

        try {
            const saved = await saveHighlights(
                token,
                bookId,
                selectedVerses,
                color
            );

            // An old session must not report success to the current UI.
            if (session !== sessionRef.current) {
                return false;
            }

            setHighlights((current) =>
                mergeHighlights(current, saved)
            );

            // The backend confirmed the save.
            return true;
        } catch (error) {
            if (session === sessionRef.current) {
                setError(error.message);
            }

            // Keep the selection available for retrying.
            return false;
        } finally {
            // This still runs before the function finishes returning.
            if (session === sessionRef.current) {
                setIsSaving(false);
            }
        }
    }

    // Remove highlights from the selected passage.
    async function handleClearHighlights(selection) {
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

        const session = sessionRef.current;
        setIsSaving(true);

        try {
            // Ask the backend to clear only this exact verse collection.
            const { removedIds } = await clearHighlights(
                token,
                selection.bookId,
                selection.verses
            );

            if (session === sessionRef.current) {
                // Use a Set for checking whether each record was removed.
                const removed = new Set(removedIds);

                setHighlights((current) =>
                    current.filter((highlight) => !removed.has(highlight.id))
                );
            }
        } catch (error) {
            if (session === sessionRef.current) {
                setError(error.message);
            }
        } finally {
            if (session === sessionRef.current) {
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