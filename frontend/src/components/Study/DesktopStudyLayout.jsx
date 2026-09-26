import ScripturePanel from "../Scripture/ScripturePanel";
import CommentaryPanel from "../Commentary/CommentaryPanel";
import NotesPanel from "../Notes/NotesPanel";

import DesktopStudyTabs from "./DesktopStudyTabs";


export default function DesktopStudyLayout({
    layout,

    verses,
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

    urlCommentary
}) {
    return (
        <main
            className={`
                mt-[108px]

                grid

                ${
                    layout === "side"
                        ? "grid-cols-[60%_40%]"
                        : "grid-rows-2"
                }

                h-[calc(100vh-108px)]
                overflow-hidden

                max-[768px]:hidden
            `}
        >

            {/* Scripture */}

            <div
                className="
                    min-h-0
                    overflow-hidden
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


            {/* Right panel */}

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

                    {rightPanelTab === "commentary" ? (

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

                    ) : (

                        <NotesPanel
                            book={book}
                            chapter={chapter}

                            selectedVerse={selectedVerse}

                            books={books}
                        />

                    )}

                </div>

            </div>

        </main>
    );
}