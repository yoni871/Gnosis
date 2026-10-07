import ScripturePanel from "../Scripture/ScripturePanel";
import CommentaryPanel from "../Commentary/CommentaryPanel";
import NotesPanel from "../Notes/NotesPanel";
import BookmarksPanel from "../Bookmarks/BookmarksPanel";


export default function MobileStudyLayout({
    mobileTab,
    setMobileTab,

    verses,
    book,
    chapter,

    translation,
    translations,

    selectedVerse,
    setSelectedVerse,
    setTranslation,

    books,

    notesState,
    commentaryState,
    bookmarksState,
    bookmarkPreviews
}) {
    return (
        <main
            className="
                hidden

                max-[768px]:fixed
                max-[768px]:left-0
                max-[768px]:right-0
                max-[768px]:top-[151px]
                max-[768px]:bottom-[49px]
                max-[768px]:block

                max-[768px]:overflow-hidden
            "
        >
            {mobileTab === "scripture" && (
                <div
                    className="
                        h-full
                        min-h-0
                        overflow-y-auto
                        overscroll-contain
                    "
                >
                    <ScripturePanel
                        books={books}
                        bookmarksState={bookmarksState}
                        verses={verses}
                        book={book}
                        chapter={chapter}
                        translation={translation}
                        translations={translations}
                        selectedVerse={selectedVerse}
                        setSelectedVerse={setSelectedVerse}
                        setTranslation={setTranslation}
                    />
                </div>
            )}

            {mobileTab === "commentary" && (
                <div
                    className="
                        h-full
                        min-h-0
                        overflow-hidden
                    "
                >
                    <CommentaryPanel
                        book={book}
                        chapter={chapter}
                        selectedVerse={selectedVerse}
                        commentaryState={commentaryState}
                    />
                </div>
            )}

            {mobileTab === "notes" && (
                <div
                    className="
                        h-full
                        min-h-0
                        overflow-hidden
                    "
                >
                    <NotesPanel
                        book={book}
                        chapter={chapter}
                        selectedVerse={selectedVerse}
                        books={books}
                        notesState={notesState}
                    />
                </div>
            )}
            {/* Display the shared bookmark list when the mobile tab is selected. */}
            {mobileTab === "bookmarks" && (
                <div className="h-full min-h-0 overflow-hidden">
                    <BookmarksPanel
                        bookmarksState={bookmarksState}
                        books={books}
                        translation={translation}
                        onOpen={() => setMobileTab("scripture")}
                        // Pass the previews already loaded by StudyPage.
                        bookmarkPreviews={bookmarkPreviews}
                    />
                </div>
            )}
        </main>
    );
}