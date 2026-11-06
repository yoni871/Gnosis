import { chapterDisplayName, chapterPath } from "./seo";

// Build the reader URL for a saved reading-state row, so the landing
// page's Continue button restores the exact spot: book, chapter,
// translation, commentary, and focused verse.
export function readingStateUrl(state) {
    const params = new URLSearchParams();
    params.set("translation", state.translation);

    if (state.commentary_id != null) {
        params.set("commentary", String(state.commentary_id));
    }

    if (state.verse_number != null) {
        params.set("verse", String(state.verse_number));
    }

    return `${chapterPath(state.book, state.chapter_number)}?${params.toString()}`;
}

// Short label for the Continue button's note: "Genesis 1 · ESV".
export function readingStateLabel(state) {
    return `${chapterDisplayName(state.book)} ${state.chapter_number} · ${state.translation}`;
}
