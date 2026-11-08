import { Suspense, lazy, useEffect, useId, useMemo, useRef, useState } from "react"
import { ChevronDown, Bookmark } from "lucide-react";
import VerseActions from "./VerseActions";
import ReaderDropdownOptions from "../ReaderDropdownOptions";
import useClickOutside from "../../hooks/useClickOutside";
// The modal is only opened on demand, so it loads in its own chunk
// instead of adding to the reader's first paint.
const OriginalLanguageModal = lazy(() =>
    import("../OriginalLanguage/OriginalLanguageModal")
);
import { isHighlightSelected } from "../../utils/highlightUtils";
import { getTranslationNotice } from "../../utils/translationNotice";
import "./ScripturePanel.css";

export default function ScripturePanel({
    verses = [],
    versesLoading = false,
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
    verseSelection,
    navigateToPassage
}) {
    const verseRefs = useRef({});
    const scriptureScrollRef = useRef(null);
    const [isTranslationMenuOpen, setIsTranslationMenuOpen] = useState(false);
    const translationTriggerRef = useRef(null);
    const translationMenuId = useId();
    const translationDropdownRef = useClickOutside(() => setIsTranslationMenuOpen(false));
    const [isOriginalLanguageOpen, setIsOriginalLanguageOpen] = useState(false);
    // The translation list arrives in database order; the menu shows it
    // alphabetically by abbreviation so a growing list stays findable.
    // Sorted here at render time only — the underlying order is untouched,
    // so StudyPage's default (the third database row, KJV) does not change.
    // Memoised: the sort runs once per translations change, not per render.
    const sortedTranslations = useMemo(
        () => [...translations].sort((a, b) =>
            a.abbreviation.localeCompare(b.abbreviation)
        ),
        [translations]
    );
    // Find the database record for the book currently being read.
    const currentBook = useMemo(
        () => books.find((item) => item.name === book),
        [books, book]
    );

    // Look up which verses are selected in the chapter currently displayed.
    // verseSelection.selection is the stable session state object, so
    // this only recomputes when the selection actually changes.
    const selectedNumbers = useMemo(
        () => new Set(
            verseSelection.selection.bookId === currentBook?.id
                ? verseSelection.selection.verses
                    .filter((point) => point.chapter === chapter)
                    .map((point) => point.verse)
                : []
        ),
        [verseSelection.selection, currentBook, chapter]
    );

    // Prefer the focused verse; otherwise use the last selected verse in this chapter.
    const actionVerse = useMemo(
        () => selectedNumbers.has(selectedVerse)
            ? selectedVerse
            : Array.from(selectedNumbers).pop(),
        [selectedNumbers, selectedVerse]
    );

    // Look up saved colors by verse number for the chapter being displayed.
    // highlights is the stable session state array, so this only
    // recomputes when the highlights actually change.
    const highlightColors = useMemo(() => {
        const colors = new Map();

        for (const highlight of highlightsState.highlights) {
            if (
                highlight.book_id === currentBook?.id &&
                highlight.chapter === chapter
            ) {
                colors.set(highlight.verse, highlight.color);
            }
        }

        return colors;
    }, [highlightsState.highlights, currentBook, chapter]);
    // Keep the bookmark action tied to the verse hosting the toolbar.
    const passage = useMemo(
        () => currentBook && actionVerse !== undefined
            ? {
                bookId: currentBook.id,
                startChapter: chapter,
                startVerse: actionVerse,
                endChapter: chapter,
                endVerse: actionVerse
            }
            : null,
        [currentBook, actionVerse, chapter]
    );

    // Check whether this exact passage is already bookmarked.
    const savedBookmark = passage
        ? bookmarksState.findBookmark(passage)
        : null;

    // The original-language modal covers the selected verses in this
    // chapter as one range (a non-contiguous selection spans min–max).
    // Its state lives here, not in StudyPage, so the reader's position
    // and selection are untouched by opening or closing it.
    const selectedVersesInChapter = [...selectedNumbers].sort((a, b) => a - b);
    const originalLanguageStartVerse = selectedVersesInChapter[0] ?? null;
    const originalLanguageEndVerse =
        selectedVersesInChapter[selectedVersesInChapter.length - 1] ?? null;

    // The reader only moves on a chapter change or an explicit jump to a
    // verse (a click, or a pick from the verse menu). Deselecting a verse
    // used to scroll the reader away — to the top when nothing remained
    // selected, or up to the next selected verse — even though the reader
    // was looking right at the verse they just tapped.
    //
    // Switching translation re-fetches the same chapter in another
    // translation, so the verses array changes without the location
    // changing. That must not move the reader either — the reader stays
    // where they were reading.
    const previousVersesRef = useRef(null);
    const displayedLocationRef = useRef(null);
    const previousSelectionRef = useRef(null);
    useEffect(() => {
        // Respect the reduced-motion preference, as the landing page
        // and About navigation already do: smooth scrolling becomes an
        // instant jump. Optional chaining matches their pattern and
        // keeps this safe where matchMedia is unavailable (jsdom).
        const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth";
        const versesChanged = previousVersesRef.current !== verses;
        previousVersesRef.current = verses;

        // Remember the selection this run saw, so the next run can tell a
        // fresh jump to a verse apart from focus falling back to a verse
        // that was already selected.
        const previousSelection = previousSelectionRef.current;
        previousSelectionRef.current = verseSelection.selection;

        if (versesChanged) {
            // Only the arrival of actual verses can move the reader. The
            // mount run (empty verses) establishes nothing — without this
            // guard it would record the location before any verse exists,
            // and the scroll to a restored verse would never happen.
            if (verses.length === 0) {
                return;
            }

            // New verses for a NEW chapter (or first load): start at the
            // top, or at the restored verse when one is focused. The same
            // chapter in a new translation keeps the reader where they are.
            const locationChanged =
                displayedLocationRef.current === null ||
                displayedLocationRef.current.book !== book ||
                displayedLocationRef.current.chapter !== chapter;
            displayedLocationRef.current = { book, chapter };

            if (!locationChanged) {
                return;
            }

            if (selectedVerse) {
                verseRefs.current[selectedVerse]?.scrollIntoView({
                    behavior,
                    block: "center"
                });
            } else {
                scriptureScrollRef.current?.scrollTo({
                    top: 0,
                    behavior
                });
            }
            return;
        }

        if (!selectedVerse) {
            // Deselecting or clearing a selection leaves the scroll alone.
            return;
        }

        // Focus moved to a verse that was already selected — a deselect
        // falling back to another selected verse. Stay where the reader is.
        const wasAlreadySelected =
            previousSelection?.bookId === currentBook?.id &&
            previousSelection.verses.some(
                (point) =>
                    point.chapter === chapter &&
                    point.verse === selectedVerse
            );
        if (wasAlreadySelected) {
            return;
        }

        verseRefs.current[selectedVerse]?.scrollIntoView({
            behavior,
            block: "center"
        });
    }, [selectedVerse, verses, verseSelection.selection, currentBook, chapter]);

    // Enable clearing when at least one selected coordinate has a highlight.
    const hasSelectedHighlight = useMemo(
        () => highlightsState.highlights.some((highlight) =>
            isHighlightSelected(highlight, verseSelection.selection)
        ),
        [highlightsState.highlights, verseSelection.selection]
    );

    return (
        <section className="
            h-full
            px-[clamp(30px,5vw,75px)]
            max-[768px]:px-[20px]
            scripture-panel
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

                    <div ref={translationDropdownRef} className="relative">
                        <button
                            type="button"
                            ref={translationTriggerRef}
                            aria-expanded={isTranslationMenuOpen}
                            aria-controls={translationMenuId}
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
                            <div id={translationMenuId} className="absolute right-0 top-full z-[1000] w-[260px] max-w-[calc(100vw-32px)] rounded border border-[var(--border)] bg-[var(--bg-panel)] p-[4px] shadow-lg">
                                <ReaderDropdownOptions
                                    items={sortedTranslations.map((item) => ({ value: item.abbreviation, label: item.abbreviation, description: item.name }))}
                                    selectedValue={translation}
                                    onSelect={setTranslation}
                                    onClose={() => setIsTranslationMenuOpen(false)}
                                    triggerRef={translationTriggerRef}
                                    searchLabel="Search translations"
                                    testId="translation-list"
                                    maxHeight={300}
                                />
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
                scripture-scroll
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

                <div className="scripture-chapter-header">
                    <h2 className="scripture-chapter-heading">
                        {book?.toUpperCase()} {chapter}
                    </h2>
                    <div className="scripture-chapter-divider" aria-hidden="true">
                        <span>†</span>
                    </div>
                </div>

                <div className="
                    mx-auto
                    max-w-[550px]
                    scripture-reading-body
                    text-[var(--text-primary)]
                ">
                    {/* While the first chapter is still loading there
                        is nothing to show yet, so say so instead of an
                        empty pane. Once verses exist they stay visible
                        while a new chapter loads. */}
                    {versesLoading && verses.length === 0 ? (
                        <p className="text-center text-[1rem] text-[var(--text-muted)]">
                            Loading Scripture…
                        </p>
                    ) : (
                        verses.map((verse) => (
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
                                scripture-verse
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
                            <sup className="scripture-verse-number">
                                {verse.verse_number}
                            </sup>

                            {verse.text}
                            {/* Anchor an out-of-flow overlay to the selected verse. */}
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
                                    onOriginalLanguage={() => setIsOriginalLanguageOpen(true)}
                                    // Clear both verse selection and commentary emphasis when X is clicked.
                                    onClearSelection={() => {
                                        verseSelection.clearSelection();
                                        setSelectedVerse(null);
                                    }}  
                                />
                            )}
                            
                        </span>
                    )))}
                </div>

                {isOriginalLanguageOpen && originalLanguageStartVerse !== null && (
                    <Suspense fallback={null}>
                        <OriginalLanguageModal
                            book={book}
                            chapter={chapter}
                            startVerse={originalLanguageStartVerse}
                            endVerse={originalLanguageEndVerse}
                            englishVerses={verses.filter(
                                (verse) =>
                                    verse.verse_number >= originalLanguageStartVerse &&
                                    verse.verse_number <= originalLanguageEndVerse
                            )}
                            translation={translation}
                            onClose={() => setIsOriginalLanguageOpen(false)}
                            onNavigateToVerse={navigateToPassage}
                        />
                    </Suspense>
                )}

                {/* Copyright notice for a licensed translation. The notice
                    (and its link, where the licence asks for one) travels
                    with the translation row from /translations, so the
                    passage and its attribution can never drift apart. */}
                {(() => {
                    const notice = getTranslationNotice(translations, translation);
                    if (!notice) {
                        return null;
                    }
                    return (
                        <p className="mx-auto mt-[36px] mb-[28px] max-w-[550px] text-center text-[12px] leading-[1.7] text-[var(--text-muted)]">
                            {notice.text}{" "}
                            {notice.url && (
                                <a
                                    href={notice.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline"
                                >
                                    {notice.host}
                                </a>
                            )}
                        </p>
                    );
                })()}

            </div>

        </section>
    )
}
