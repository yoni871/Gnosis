import { useEffect, useRef, useState } from "react"
import { ChevronDown, Bookmark } from "lucide-react";

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
    bookmarksState
}) {
    const verseRefs = useRef({});
    const scriptureScrollRef = useRef(null);
    const [isTranslationMenuOpen, setIsTranslationMenuOpen] = useState(false);
    // Find the database record for the book currently being read.
    const currentBook = books.find((item) => item.name === book);

    // Represent a selected verse as a passage with matching start and end.
    const passage = currentBook && selectedVerse !== null && selectedVerse !== undefined
        ? {
            bookId: currentBook.id,
            startChapter: chapter,
            startVerse: selectedVerse,
            endChapter: chapter,
            endVerse: selectedVerse
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
                            onClick={() => {
                                setSelectedVerse((currentVerse) =>
                                    currentVerse === verse.verse_number
                                        ? null
                                        : verse.verse_number
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
                                    verse.verse_number === selectedVerse
                                        ? "bg-[var(--verse-highlight)] border-l-[3px] border-[var(--color-brand)] pl-[12px] transition-[background] duration-200 ease-in-out"
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
                            {/* Anchor the floating action at the end of the selected verse */}
                            {verse.verse_number === selectedVerse && passage && (
                                <span className="relative inline-block w-0 align-baseline">
                                    <button
                                        type="button"
                                        // Wait for the current bookmark request to finish before another click.
                                        disabled={
                                            bookmarksState.isLoading ||
                                            bookmarksState.isSaving ||
                                            bookmarksState.deletingId !== null
                                        }
                                        //give he icon button a name for screen readers and a hover tooltip
                                        aria-label={savedBookmark ? "Remove bookmark" : "Bookmark passage"}
                                        title={savedBookmark ? "Remove bookmark" : "Bookmark passage"}
                                        //prevent the button click from deselecting the verse
                                        onClick={(event) => {
                                            //keep the click from reaching the verse's selection handler
                                            event.stopPropagation();
                                            //remove an existing bookmark, or save the selected passage
                                            if(savedBookmark) {
                                                bookmarksState.handleDeleteBookmark(savedBookmark.id);
                                            } else {
                                                bookmarksState.handleAddBookmarks(passage);
                                            }
                                        }}
                                        className="
                                            absolute right-0 top-full z-20 mt-2
                                            whitespace-nowrap
                                            rounded-lg
                                            border border-[var(--border)]
                                            bg-[var(--bg-panel)]
                                            px-3 py-2
                                            font-sans text-[12px] font-semibold leading-normal
                                            tracking-normal
                                            text-[var(--color-brand)]
                                            shadow-lg
                                            cursor-pointer
                                            hover:bg-[var(--bg-control-hover)]
                                            disabled:cursor-wait
                                            disabled:opacity-50
                                        "
                                    >
                                        <Bookmark 
                                            size={18}
                                            fill={savedBookmark ? "currentColor" : "none"}
                                            aria-hidden="true"
                                        />
                                    </button>
                                </span>
                            )}
                        </span>
                    ))}
                </div>

            </div>

        </section>
    )
}