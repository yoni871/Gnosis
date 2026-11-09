import { useCallback, useMemo } from "react";

import usePrivateSession from "./usePrivateSession";

const EMPTY = { bookId: null, verses: [] };

export default function useVerseSelection() {
    // Store the book and the exact verses selected within it.
    const { state: selection, setCurrent: setSelection } = usePrivateSession(EMPTY);

    // Select an unselected verse, or deselect one already in the collection.
    // Stable across renders (setSelection is a stable callback), so the
    // hook's return value keeps its identity unless the selection changes.
    const toggleVerse = useCallback((bookId, chapter, verse) => {
        setSelection((current) => {
            const point = { chapter, verse };

            // Selecting in another book starts a new collection.
            if (current.bookId !== bookId) {
                return {
                    bookId,
                    verses: [point]
                };
            }

            // Both chapter and verse must match to identify the same coordinate.
            const isSelected = current.verses.some((item) =>
                item.chapter === chapter && item.verse === verse
            );

            return {
                bookId,
                verses: isSelected
                    // Remove only the matching coordinate.
                    ? current.verses.filter((item) =>
                        !(item.chapter === chapter && item.verse === verse)
                    )
                    // Keep existing selections and append the new coordinate.
                    : [...current.verses, point]
            };
        });
    }, [setSelection]);

    // Replace the current selection when navigating to a specific verse.
    const replaceSelection = useCallback((bookId, chapter, verse) => {
        setSelection({
            bookId,
            verses: [{ chapter, verse }]
        });
    }, [setSelection]);

    // Replace the current selection with an explicit set of verses in
    // one chapter (used when restoring a selection from the URL).
    const replaceSelectionSet = useCallback((bookId, chapter, verseNumbers) => {
        setSelection({
            bookId,
            verses: verseNumbers.map((verse) => ({ chapter, verse }))
        });
    }, [setSelection]);

    // Remove selected verses missing from a successfully loaded chapter.
    const retainAvailableVerses = useCallback((bookId, chapter, verses) => {
        // Use a Set for quick verse-number lookups.
        const available = new Set(
            verses.map((verse) => verse.verse_number)
        );

        setSelection((current) => {
            // A response for another book must not change the current selection.
            if (current.bookId !== bookId) {
                return current;
            }

            const remaining = current.verses.filter((point) =>
                // Only check coordinates belonging to the loaded chapter.
                point.chapter !== chapter || available.has(point.verse)
            );

            // Preserve the existing object when nothing was removed.
            if (remaining.length === current.verses.length) {
                return current;
            }

            return {
                bookId: remaining.length > 0 ? current.bookId : null,
                verses: remaining
            };
        });
    }, [setSelection]);

    // Keep this function stable so other hooks can depend on it.
    const clearSelection = useCallback((expectedSelection = null) => {
        setSelection((current) => {
            // Preserve a newer selection made during an asynchronous save.
            if (expectedSelection !== null && current !== expectedSelection) {
                return current;
            }

            // Avoid updating state when nothing is selected.
            if (current.bookId === null && current.verses.length === 0) {
                return current;
            }

            // Clear temporary selection without changing highlight colors.
            return {
                bookId: null,
                verses: []
            };
        });
    }, [setSelection]);
    // Let StudyPage read the selection and request changes through these actions.
    // Memoised so the returned object keeps its identity unless the
    // selection or one of the actions changes.
    return useMemo(() => ({
       selection,
        toggleVerse,
        replaceSelection,
        replaceSelectionSet,
        retainAvailableVerses,
        clearSelection
    }), [
        selection,
        toggleVerse,
        replaceSelection,
        replaceSelectionSet,
        retainAvailableVerses,
        clearSelection
    ]);
}