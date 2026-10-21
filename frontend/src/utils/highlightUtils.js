// Identify a verse independently of its color or database record ID.
function getHighlightKey(highlight) {
    return `${highlight.book_id}:${highlight.chapter}:${highlight.verse}`;
}

// Keep existing highlights, replacing any verses present in the incoming batch.
export function mergeHighlights(current, incoming) {
    const byVerse = new Map();

    // Start with the highlights already displayed.
    for (const highlight of current) {
        byVerse.set(getHighlightKey(highlight), highlight);
    }

    // Replace matching verses or add newly highlighted ones.
    for (const highlight of incoming) {
        byVerse.set(getHighlightKey(highlight), highlight);
    }

    // Convert the Map's records back into an array for React state.
    return [...byVerse.values()];
}

// Build temporary records from selected verse coordinates.
export function createGuestHighlights(bookId, selectedVerses, color) {
    const now = new Date().toISOString();

    return selectedVerses.map(({ chapter, verse }) => ({
        // Use a stable local ID; guest records never enter PostgreSQL.
        id: `guest-${bookId}-${chapter}-${verse}`,
        book_id: bookId,
        chapter,
        verse,
        color: color.toUpperCase(),
        created_at: now,
        updated_at: now
    }));
}

// Check whether a highlighted verse belongs to an inclusive passage range.
export function isHighlightInPassage(highlight, passage) {
    // Matching coordinates in another book must remain untouched.
    if (highlight.book_id !== passage.bookId) {
        return false;
    }

    const afterStart =
        highlight.chapter > passage.startChapter ||
        (
            highlight.chapter === passage.startChapter &&
            highlight.verse >= passage.startVerse
        );

    const beforeEnd =
        highlight.chapter < passage.endChapter ||
        (
            highlight.chapter === passage.endChapter &&
            highlight.verse <= passage.endVerse
        );

    return afterStart && beforeEnd;
}

// Check whether this highlighted verse is explicitly selected.
export function isHighlightSelected(highlight, selection) {
    // Coordinates from another book must never match.
    if (highlight.book_id !== selection.bookId) {
        return false;
    }

    return selection.verses.some((point) =>
        point.chapter === highlight.chapter &&
        point.verse === highlight.verse
    );
}