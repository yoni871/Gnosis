import { useEffect, useRef, useState } from "react"
import { ChevronDown, Bookmark } from "lucide-react";
import VerseActions from "./VerseActions";
import { isHighlightSelected } from "../../utils/highlightUtils";

export default function ScripturePanel({
    verses = [],
    book = "",
    chapter = 1,
    translation = "",
    translations = [],
    selectedVerse,
    setSelectedVerse,
    setTranslation,
    books = [],
    bookmarksState,
    highlightsState,
    verseSelection
}) {
    const verseRefs = useRef({});
    const scriptureScrollRef = useRef(null);
    const [isTranslationMenuOpen, setIsTranslationMenuOpen] = useState(false);
    // Find the database record for the book currently being read.
    const currentBook = books.find((item) => item.name === book);

    // Look up which verses are selected in the chapter currently displayed.
    const selectedNumbers = new Set(
        verseSelection.selection.bookId === currentBook?.id
            ? verseSelection.selection.verses
                .filter((point) => point.chapter === chapter)
                .map((point) => point.verse)
            : []
    );

    // Prefer the focused verse; otherwise use the last selected verse in this chapter.
    const actionVerse = selectedNumbers.has(selectedVerse)
        ? selectedVerse
        : Array.from(selectedNumbers).pop();

    // Look up saved colors by verse number for the chapter being displayed.
    const highlightColors = new Map();

    for (const highlight of highlightsState.highlights) {
        if (
            highlight.book_id === currentBook?.id &&
            highlight.chapter === chapter
        ) {
            highlightColors.set(highlight.verse, highlight.color);
        }
    }
    // Keep the bookmark action tied to the verse hosting the toolbar.
    const passage = currentBook && actionVerse !== undefined
        ? {
            bookId: currentBook.id,
            startChapter: chapter,
            startVerse: actionVerse,
            endChapter: chapter,
            endVerse: actionVerse
        }
        : null;

    // Check whether this exact passage is already bookmarked.
    const savedBookmark = passage
        ? bookmarksState.findBookmark(passage)
        : null;

    useEffect(() => {
        if (selectedVerse) {
            verseRefs.current[selectedVerse]?.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        } else {
            scriptureScrollRef.current?.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        }
    }, [selectedVerse, verses]);

    // Enable clearing when at least one selected coordinate has a highlight.
    const hasSelectedHighlight = highlightsState.highlights.some((highlight) =>
        isHighlightSelected(highlight, verseSelection.selection)
    );

    return (
        <section className="
            h-full
            px-[clamp(30px,5vw,75px)]
            max-[768px]:px-[20px]
            bg-[var(--bg-header)]
            shadow-[inset_0_0_20px_rgba(80,55,35,0.12)]
            overflow-hidden
            flex
            flex-col
        ">

            <div className="
                -mx-[clamp(30px,5vw,75px)]
                bg-[var(--bg-input)]
            ">
                <div className="
                    flex
                    items-center
                    justify-between
                    border-b
                    border-[var(--border)]
                    bg-[var(--bg-nav)]
                    px-[clamp(30px,5vw,75px)]
                    py-[5px]
                    text-[8px]
                    font-bold
                    tracking-[2.5px]
                    text-[var(--text-muted)]
                ">
                    <span>HOLY BIBLE</span>

                    <div className="relative">
                        <button
                            className="
                                flex
                                items-center
                                gap-[5px]
                                rounded-[6px]
                                border
                                border-[var(--border)]
                                bg-[var(--bg-control-hover)]
                                px-[10px]
                                py-[6px]
                                font-serif
                                text-[10px]
                                text-[var(--text-primary)]
                                cursor-pointer
                            "
                            onClick={() => setIsTranslationMenuOpen(!isTranslationMenuOpen)}
                        >
                            {translation}

                            <ChevronDown
                                size={12}
                                className="shrink-0"
                            />
                        </button>

                        {isTranslationMenuOpen && (
                            <div className="
                                absolute
                                right-0
                                top-full
                                z-[1000]
                                min-w-[190px]
                                border
                                border-[var(--border)]
                                bg-[var(--bg-panel)]
                                p-[4px]
                                shadow-lg
                            ">

                                {translations.map((translationItem, index) => (
                                    <div
                                        key={translationItem.id}
                                        className={`
                                            cursor-pointer
                                            rounded
                                            px-2
                                            py-2
                                            text-[var(--text-primary)]
                                            hover:bg-[var(--bg-control-hover)]
                                            ${
                                                translation === translationItem.abbreviation
                                                    ? "bg-[var(--bg-control-hover)] font-semibold !text-[var(--color-brand)]"
                                                    : ""
                                            }
                                            ${
                                                index !== translations.length - 1
                                                    ? "border-b border-[var(--border)]"
                                                    : ""
                                            }
                                        `}
                                        onClick={() => {
                                            setTranslation(translationItem.abbreviation);
                                            setIsTranslationMenuOpen(false);
                                        }}
                                    >
                                        <div className="
                                            text-[11px]
                                            font-semibold
                                        ">
                                            {translationItem.abbreviation}
                                        </div>

                                        <div className="
                                            mt-[2px]
                                            text-[9px]
                                            font-normal
                                            text-[var(--text-muted)]
                                        ">
                                            {translationItem.name}
                                        </div>
                                    </div>
                                ))}
                                

                            </div>
                        )}
                    </div>

                </div>

            </div>
            {/* show feedback when a bookmark request fails*/}
            {bookmarksState.error && (
                <p
                    role="alert"
                    className="
                        m-0
                        border-b border-[var(--border)]
                        py-2
                        text-[12px]
                        text-[var(--color-brand)]
                    "
                >
                    {bookmarksState.error}
                </p>
            )}

            {/* Display failed highlight actions without hiding the Scripture. */}
            {highlightsState.error && (
                <p
                    role="alert"
                    className="
                        m-0
                        border-b border-[var(--border)]
                        py-2
                        text-[12px]
                        text-[var(--color-brand)]
                    "
                >
                    {highlightsState.error}
                </p>
            )}

            <div ref={scriptureScrollRef}
            className="
                min-h-0
                flex-1
                overflow-y-auto
                bg-[var(--bg-header)]
            ">

                <div className="
                    mx-auto
                    mt-[40px]
                    max-w-[700px]
                    grid
                    grid-cols-3
                    border-b-[3px]
                    border-double
                    border-[var(--border)]
                    pb-[5px]
                    text-center
                    text-[10px]
                    tracking-[2px]
                    text-[var(--text-muted)]
                ">
                    <span className="text-left">
                        {book?.toUpperCase() || ""}
                    </span>
                    <span>{translation}</span>
                    <span className="text-right">CH. {chapter}</span>
                </div>

                <div className="
                    mt-[34px]
                    mb-[28px]
                    text-center
                ">
                    <p className="
                        m-0
                        mb-[13px]
                        text-[10px]
                        font-medium
                        tracking-[3.5px]
                        text-[var(--text-muted)]
                    ">
                        - CHAPTER {chapter} -
                    </p>

                    <h2 className="
                        m-0
                        font-serif
                        text-[clamp(26px,2.2vw,34px)]
                        font-normal
                        italic
                        text-[var(--text-primary)]
                    ">
                        {book}
                    </h2>

                    <div className="
                        mt-[15px]
                        text-[13px]
                        tracking-[3px]
                        text-[var(--color-brand)]
                    ">
                        ────── † ──────
                    </div>
                </div>

                <div className="
                    mx-auto
                    max-w-[550px]
                    text-justify
                    text-[1.2rem]
                    leading-[2.05]
                    tracking-[0.012em]
                    [word-spacing:0.03em]
                    text-[var(--text-primary)]
                    [font-family:'Lora',Georgia,'Times_New_Roman',serif]
                    hyphens-auto
                ">
                    {verses.map((verse) => (
                        <span
                            // Add transparency to the saved RGB color without fading the text.
                            style={{
                                backgroundColor: highlightColors.has(verse.verse_number)
                                    ? `${highlightColors.get(verse.verse_number)}40`
                                    : undefined
                            }}

                            onClick={() => {
                                // Wait until the current book's database ID is available.
                                if (!currentBook) {
                                    return;
                                }

                                const clickedVerse = verse.verse_number;
                                const isDeselecting = selectedNumbers.has(clickedVerse);

                                // Find which verses will remain selected in this chapter.
                                const remaining = [...selectedNumbers].filter(
                                    (number) => number !== clickedVerse
                                );

                                // Toggle the clicked verse's selection.
                                verseSelection.toggleVerse(
                                    currentBook.id,
                                    chapter,
                                    clickedVerse
                                );

                                // Focus a newly selected verse.
                                if (!isDeselecting) {
                                    setSelectedVerse(clickedVerse);
                                    return;
                                }

                                // Preserve existing focus if that verse remains selected.
                                setSelectedVerse((current) =>
                                    remaining.includes(current)
                                        ? current
                                        : remaining[remaining.length - 1] ?? null
                                );
                            }}

                            key={verse.verse_number}
                            ref={(element) => {
                                verseRefs.current[verse.verse_number] = element;
                            }}
                            className={`
                                inline
                                m-0
                                mb-[4px]
                                font-[inherit]
                                text-[inherit]
                                leading-[inherit]
                                tracking-[inherit]
                                cursor-pointer
                                ${
                                    selectedNumbers.has(verse.verse_number)
                                        ? "underline decoration-[var(--color-brand)] decoration-dotted underline-offset-4"
                                        : ""
                                }
                            `}
                        >
                            <sup className="
                                ml-[6px]
                                mr-[3px]
                                align-super
                                text-[0.65em]
                                font-bold
                                text-[var(--color-brand)]
                            ">
                                {verse.verse_number}
                            </sup>

                            {verse.text}
                            {/* Show actions at the end of the selected verse. */}
                            {verse.verse_number === actionVerse && passage && (
                                <VerseActions
                                    passage={passage}
                                    savedBookmark={savedBookmark}
                                    bookmarksState={bookmarksState}
                                    // Apply the color, then deselect only after a successful save.
                                    onHighlight={async (color) => {
                                        // Remember which selection this action is saving.
                                        const selection = verseSelection.selection;

                                        // Wait for the hook to report success or failure.
                                        const succeeded = await highlightsState.handleSaveHighlights(
                                            selection,
                                            color
                                        );

                                        // Clear selection and commentary focus only after a successful highlight.
                                        if (succeeded) {
                                            verseSelection.clearSelection(selection);

                                            // Remove commentary focus if it still belongs to this operation.
                                            setSelectedVerse((current) =>
                                                selection.verses.some((point) =>
                                                    point.chapter === chapter && point.verse === current
                                                )
                                                    ? null
                                                    : current
                                            );
                                        }
                                    }}
                                    isHighlightBusy={
                                        highlightsState.isLoading || highlightsState.isSaving
                                    }
                                    // Clear only the explicitly selected verses.
                                    onClearHighlight={() =>
                                        highlightsState.handleClearHighlights(verseSelection.selection)
                                    }
                                    hasHighlight={hasSelectedHighlight}
                                    // Clear both verse selection and commentary emphasis when X is clicked.
                                    onClearSelection={() => {
                                        verseSelection.clearSelection();
                                        setSelectedVerse(null);
                                    }}  
                                />
                            )}
                            
                        </span>
                    ))}
                </div>

            </div>

        </section>
    )
}