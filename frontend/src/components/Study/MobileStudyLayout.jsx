import ScripturePanel from "../Scripture/ScripturePanel";
import CommentaryPanel from "../Commentary/CommentaryPanel";
import NotesPanel from "../Notes/NotesPanel";


export default function MobileStudyLayout({
    mobileTab,

    verses,
    book,
    chapter,

    translation,
    translations,

    selectedVerse,
    setSelectedVerse,
    setTranslation,

    books,

    urlCommentary
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

            {/* Scripture */}

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


            {/* Commentary */}

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
                        books={books}

                        selectedVerse={selectedVerse}

                        urlCommentary={
                            urlCommentary
                                ? Number(urlCommentary)
                                : null
                        }
                    />
                </div>
            )}


            {/* Notes */}

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
                    />
                </div>
            )}

        </main>
    );
}