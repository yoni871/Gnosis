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

// The saved passage and translation, including a focused verse when available.
export function readingStateLabel(state) {
    const verse = state.verse_number != null ? `:${state.verse_number}` : "";
    return `${chapterDisplayName(state.book)} ${state.chapter_number}${verse} · ${state.translation}`;
}
