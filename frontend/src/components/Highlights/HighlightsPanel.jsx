import { useNavigate } from "react-router-dom";
import HighlightCard from "./HighlightCard";

// Display shared highlights without starting additional data requests.
export default function HighlightsPanel({
    highlightsState,
    scripturePreviews,
    books = [],
    translation,
    onOpen,
    onAddNote
}) {
    const navigate = useNavigate();

    const {
        highlights,
        isLoading,
        isSaving,
        error,
        handleClearHighlights
    } = highlightsState;

    const {
        chapters,
        isLoading: isPreviewLoading,
        error: previewError
    } = scripturePreviews;

    // Resolve book names for saved and temporary guest highlights.
    function getBookName(highlight) {
        const book = books.find(
            (item) => item.id === highlight.book_id
        );

        return book?.name || highlight.book || "Unknown book";
    }

    // Read one verse from the shared chapter previews.
    function getVerseText(highlight) {
        const key = `${highlight.book_id}:${highlight.chapter}`;
        const verses = chapters[key] || [];

        return verses.find(
            (verse) => verse.verse_number === highlight.verse
        )?.text || "";
    }

    // Navigate using the same URL format as bookmarks and search results.
    function openHighlight(highlight) {
        const book = getBookName(highlight);

        const params = new URLSearchParams({
            verse: String(highlight.verse),
            translation
        });

        navigate(
            `/bible/${encodeURIComponent(book)}/${highlight.chapter}?${params.toString()}`
        );

        // Mobile can switch to Scripture after navigation.
        onOpen?.();
    }

    // Reuse the existing clear action for a selection containing one verse.
    function removeHighlight(highlight) {
        handleClearHighlights({
            bookId: highlight.book_id,
            verses: [
                {
                    chapter: highlight.chapter,
                    verse: highlight.verse
                }
            ]
        });
    }

    return (
        <aside className="flex h-full min-h-0 flex-col bg-[var(--bg-panel)] px-5 py-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <h2 className="m-0 font-serif text-[18px] text-[var(--text-primary)]">
                    Highlights
                </h2>

                {/* Each stored record represents one highlighted verse. */}
                <span className="text-[12px] text-[var(--text-muted)]">
                    {highlights.length}
                </span>
            </div>

            {/* Keep existing highlights visible if an action fails. */}
            {error && (
                <p
                    role="alert"
                    className="mb-0 mt-3 text-[12px] text-[var(--color-brand)]"
                >
                    {error}
                </p>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto py-4">
                {isLoading ? (
                    <p
                        role="status"
                        className="text-[13px] text-[var(--text-muted)]"
                    >
                        Loading highlights…
                    </p>
                ) : highlights.length === 0 ? (
                    <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
                        No highlights yet. Select verses and choose a
                        highlighter color to add one.
                    </p>
                ) : (
                    <ul className="m-0 list-none p-0">
                        {highlights.map((highlight) => (
                            <HighlightCard
                                key={highlight.id}
                                highlight={highlight}
                                bookName={getBookName(highlight)}
                                text={getVerseText(highlight)}
                                translation={translation}
                                isPreviewLoading={isPreviewLoading}
                                previewError={previewError}
                                isBusy={isLoading || isSaving}
                                onOpen={() => openHighlight(highlight)}
                                onRemove={() => removeHighlight(highlight)}
                                // Tell the parent which highlighted verse needs a note.
                                onAddNote={() => onAddNote?.(highlight)}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </aside>
    );
}