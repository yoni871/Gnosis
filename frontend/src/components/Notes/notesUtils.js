// Creates a readable Bible reference for a saved note.
//
// Examples:
// Romans 8:28
// Romans 8:28-30
// Romans 8:28–9:2
export function getNoteReference(note, books) {
    const noteBook = books.find(
        (item) => item.id === note.book_id
    );

    const bookName = noteBook?.name || "Scripture";

    // One verse
    if (
        note.start_chapter === note.end_chapter &&
        note.start_verse === note.end_verse
    ) {
        return `${bookName} ${note.start_chapter}:${note.start_verse}`;
    }

    // Multiple verses in the same chapter
    if (note.start_chapter === note.end_chapter) {
        return `${bookName} ${note.start_chapter}:${note.start_verse}-${note.end_verse}`;
    }

    // Passage crossing chapters
    return `${bookName} ${note.start_chapter}:${note.start_verse}–${note.end_chapter}:${note.end_verse}`;
}


// Converts the database timestamp into a readable date.
//
// Example:
// 2026-09-25T18:30:00 -> Sep 25, 2026
export function formatNoteDate(date) {
    if (!date) {
        return "";
    }

    return new Date(date).toLocaleDateString(
        undefined,
        {
            month: "short",
            day: "numeric",
            year: "numeric"
        }
    );
}