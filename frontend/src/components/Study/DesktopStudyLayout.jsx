import { useCallback, useRef, useState } from "react";
import ScripturePanel from "../Scripture/ScripturePanel";
import CommentaryPanel from "../Commentary/CommentaryPanel";
import NotesPanel from "../Notes/NotesPanel";
import DesktopStudyTabs from "./DesktopStudyTabs";
import BookmarksPanel from "../Bookmarks/BookmarksPanel";
import HighlightsPanel from "../Highlights/HighlightsPanel";
import StudySplitDivider from "./StudySplitDivider";
import { clampStudySplit, DEFAULT_STUDY_SPLIT, readStudySplit, STUDY_SPLIT_STORAGE_KEY } from "./studySplit";


export default function DesktopStudyLayout({
    layout,

    verses,
    versesLoading = false,
    book,
    chapter,

    translation,
    translations,

    selectedVerse,
    setSelectedVerse,
    setTranslation,

    books,

    rightPanelTab,
    setRightPanelTab,

    notesState,
    commentaryState,
    bookmarksState,
    bookmarkPreviews,
    highlightsState,
    verseSelection,
    navigateToPassage
}) {
    const containerRef = useRef(null);
    const [split, setSplit] = useState(readStudySplit);
    const updateSplit = useCallback((position, isPercent = false) => {
        const container = containerRef.current;
        if (!container) return;
        const width = container.getBoundingClientRect().width;
        const percent = isPercent
            ? position
            : ((position - container.getBoundingClientRect().left) / width) * 100;
        const next = clampStudySplit(percent, width);
        setSplit(next);
        window.localStorage.setItem(STUDY_SPLIT_STORAGE_KEY, String(next));
    }, []);
    const resetSplit = useCallback(() => updateSplit(DEFAULT_STUDY_SPLIT, true), [updateSplit]);
    const sideBySide = layout === "side";

    return (
        <main
            ref={containerRef}
            style={sideBySide ? { gridTemplateColumns: `${split}% 8px minmax(0, 1fr)` } : undefined}
            className={`
                mt-[108px]
                grid
                ${
                    sideBySide
                        ? ""
                        : "grid-rows-2"
                }
                h-[calc(100vh-108px)]
                overflow-hidden
                max-[768px]:hidden
            `}
        >
            <div
                className="
                    min-h-0
                    overflow-hidden
                "
            >
                <ScripturePanel
                    verseSelection={verseSelection}
                    highlightsState={highlightsState}
                    books={books}
                    bookmarksState={bookmarksState}
                    verses={verses}
                    versesLoading={versesLoading}
                    book={book}
                    chapter={chapter}
                    translation={translation}
                    translations={translations}
                    selectedVerse={selectedVerse}
                    setSelectedVerse={setSelectedVerse}
                    setTranslation={setTranslation}
                    navigateToPassage={navigateToPassage}
                />
            </div>

            {sideBySide && (
                <StudySplitDivider
                    value={split}
                    onChange={updateSplit}
                    onReset={resetSplit}
                />
            )}

            <div
                className="
                    flex
                    min-h-0
                    flex-col
                    overflow-hidden
                "
            >
                <DesktopStudyTabs
                    activeTab={rightPanelTab}
                    setActiveTab={setRightPanelTab}
                />

                <div
                    className="
                        min-h-0
                        flex-1
                        overflow-hidden
                    "
                >
                    {/* Render the panel matching the selected tab. */}
                    {rightPanelTab === "commentary" && (
                        <CommentaryPanel
                            book={book}
                            chapter={chapter}
                            selectedVerse={selectedVerse}
                            commentaryState={commentaryState}
                        />
                    )}

                    {rightPanelTab === "notes" && (
                        <NotesPanel
                            book={book}
                            chapter={chapter}
                            selectedVerse={selectedVerse}
                            books={books}
                            notesState={notesState}
                        />
                    )}

                    {rightPanelTab === "bookmarks" && (
                        <BookmarksPanel 
                        bookmarksState={bookmarksState} 
                        books={books}
                        translation={translation}
                        // Pass the previews already loaded by StudyPage.
                        bookmarkPreviews={bookmarkPreviews}
                        />
                    )}
                    {/* Display highlights when their tab is active. */}
                    {rightPanelTab === "highlights" && (
                        <HighlightsPanel
                            // Capture the highlighted passage, then open Notes if starting succeeds.
                            onAddNote={(highlight) => {
                                const started = notesState.handleStartNote({
                                    bookId: highlight.book_id,
                                    startChapter: highlight.chapter,
                                    startVerse: highlight.verse,
                                    endChapter: highlight.chapter,
                                    endVerse: highlight.verse
                                });

                                if (started) {
                                    setRightPanelTab("notes");
                                }
                            }}
                            highlightsState={highlightsState}
                            // Reuse the shared previews already loaded by StudyPage.
                            scripturePreviews={bookmarkPreviews}
                            books={books}
                            translation={translation}
                        />
                    )}
                                    </div>
            </div>
        </main>
    );
}
