import { Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function BookmarksPanel({ bookmarksState, books=[], translation, onOpen, bookmarkPreviews }) {
    // Navigate to a bookmarked passage without reloading the website.
    const navigate = useNavigate();
    // Read bookmark data, loading status, and action errors.
    const { bookmarks, isLoading, error } = bookmarksState;
    // Read the shared previews without starting another fetching hook.
    const {
        chapters,
        isLoading: isPreviewLoading,
        error: previewError
    } = bookmarkPreviews;

    // Resolve the name for loaded, newly saved, and guest bookmarks.
    function getBookName(bookmark) {
        const book = books.find((item) => item.id === bookmark.book_id);

        return book?.name || bookmark.book || "Unknown book";
    }

    // Display single verses, same-chapter ranges, and cross-chapter ranges.
    function getPassageLabel(bookmark) {
        const book = getBookName(bookmark);
        const start = `${book} ${bookmark.start_chapter}:${bookmark.start_verse}`;

        // A single verse needs only its starting reference.
        if (
            bookmark.start_chapter === bookmark.end_chapter &&
            bookmark.start_verse === bookmark.end_verse
        ) {
            return start;
        }

        // Within one chapter, append only the ending verse.
        if (bookmark.start_chapter === bookmark.end_chapter) {
            return `${start}–${bookmark.end_verse}`;
        }

        // Across chapters, include both the ending chapter and verse.
        return `${start}–${bookmark.end_chapter}:${bookmark.end_verse}`;
    }

    // Collect the bookmarked verses in chapter and verse order.
    function getPassageText(bookmark) {
        const parts = [];

        for (
            let chapter = bookmark.start_chapter;
            chapter <= bookmark.end_chapter;
            chapter += 1
        ) {
            // Find the chapter loaded by our preview hook.
            const key = `${bookmark.book_id}:${chapter}`;
            const verses = chapters[key] || [];

            for (const verse of verses) {
                // Exclude verses before the passage starts.
                if (
                    chapter === bookmark.start_chapter &&
                    verse.verse_number < bookmark.start_verse
                ) {
                    continue;
                }

                // Exclude verses after the passage ends.
                if (
                    chapter === bookmark.end_chapter &&
                    verse.verse_number > bookmark.end_verse
                ) {
                    continue;
                }

                parts.push(verse.text);
            }
        }

        // Combine the selected verses into one readable preview.
        return parts.join(" ");
    }

    // Open the bookmark at its starting verse using the selected translation.
    function openBookmark(bookmark) {
        const book = getBookName(bookmark);

        // Build query parameters safely, including spaces or special characters.
        const params = new URLSearchParams({
            verse: String(bookmark.start_verse),
            translation
        });

        // Let StudyPage read the passage from the new URL.
        navigate(
            `/bible/${encodeURIComponent(book)}/${bookmark.start_chapter}?${params.toString()}`
        );
        // Let the parent decide whether opening a passage should change its layout.
        onOpen?.();
    }

    return (
        <aside className="
            flex h-full min-h-0 flex-col
            bg-[var(--bg-panel)]
            px-5 py-4
        ">
            {/* Keep the heading separate from the future scrolling list. */}
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <h2 className="m-0 font-serif text-[18px] text-[var(--text-primary)]">
                    Bookmarks
                </h2>

                <span className="text-[12px] text-[var(--text-muted)]">
                    {bookmarks.length}
                </span>
            </div>
            {/* Explain failed bookmark requests while keeping the list visible. */}
            {error && (
                <p
                    role="alert"
                    className="mb-0 mt-3 text-[12px] leading-relaxed text-[var(--color-brand)]"
                >
                    {error}
                </p>
            )}
            {/* Keep panel content independently scrollable. */}
            <div className="min-h-0 flex-1 overflow-y-auto py-4">
                {isLoading ? (
                    <p
                        role="status"
                        className="text-[13px] text-[var(--text-muted)]"
                    >
                        Loading bookmarks…
                    </p>
                ) : bookmarks.length === 0 ? (
                    <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
                        No bookmarks yet. Select a verse and use the bookmark icon
                        to add one.
                    </p>
                ) : (
                    <ul className="m-0 list-none p-0">
                        {/* Turn each bookmark into a row in the list. */}
                        {bookmarks.map((bookmark) => (
                            <li
                                key={bookmark.id}
                                className="flex items-start gap-2 border-b border-[var(--border)] py-4"
                            >
                                {/* Open the saved passage when its reference is clicked. */}
                                <button
                                    type="button"
                                    onClick={() => openBookmark(bookmark)}
                                    className="
                                        block min-w-0 flex-1
                                        cursor-pointer
                                        rounded-lg
                                        bg-transparent
                                        p-3
                                        text-left
                                        transition-colors
                                        hover:bg-[var(--bg-control-hover)]
                                        focus-visible:outline-2
                                        focus-visible:outline-[var(--color-brand)]
                                        focus-visible:outline-offset-2
                                    "
                                >
                                    {/* Keep the passage reference visually distinct from its preview. */}
                                    <span className="block font-serif text-[15px] font-semibold text-[var(--color-brand)]">
                                        {getPassageLabel(bookmark)}
                                    </span>
                                
                                {/* Show the selected translation's text and its loading status. */}
                                <span className="block mb-0 mt-2 font-serif text-[14px] leading-relaxed text-[var(--text-primary)]">
                                    {isPreviewLoading
                                        ? "Loading Scripture…"
                                        : previewError
                                            ? "Unable to load Scripture."
                                            : getPassageText(bookmark) || "No Scripture text is available."}
                                </span>

                                {/* Identify the translation used for this preview. */}
                                <span className="mt-2 block text-[10px] font-semibold text-[var(--text-muted)]">
                                    {translation}
                                </span>
                                </button>
                                {/* Remove this bookmark without opening its passage. */}
                                <button
                                    type="button"
                                    aria-label={`Remove bookmark for ${getPassageLabel(bookmark)}`}
                                    title="Remove bookmark"
                                    // Wait for loading or an existing removal to finish.
                                    disabled={isLoading || bookmarksState.deletingId !== null}
                                    onClick={() => bookmarksState.handleDeleteBookmark(bookmark.id)}
                                    className="
                                        mt-3 flex h-9 w-9 shrink-0
                                        items-center justify-center
                                        rounded-md
                                        text-[var(--text-muted)]
                                        cursor-pointer
                                        hover:bg-[var(--bg-control-hover)]
                                        hover:text-[var(--color-brand)]
                                        disabled:cursor-wait
                                        disabled:opacity-50
                                    "
                                >
                                    <Trash2 size={16} aria-hidden="true" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </aside>
    );
}