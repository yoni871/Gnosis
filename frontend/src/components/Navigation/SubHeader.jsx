import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, Check } from "lucide-react";

import BookSelector from "./BookSelector";
import ChapterSelector from "./ChapterSelector";
import VerseSelector from "./VerseSelector";
import useClickOutside from "../../hooks/useClickOutside";


const filterButton = `
    flex h-9 w-full min-w-0 items-center justify-between gap-2
    rounded-lg border border-[var(--border-control)]
    bg-[var(--bg-panel)] px-3 text-[11px] font-medium
    text-[var(--text-primary)] shadow-sm transition
    hover:border-[var(--color-brand)]
    hover:bg-[var(--bg-control-hover)]
`;

const menuStyle = `
    absolute top-[calc(100%+6px)] z-50
    overflow-hidden rounded-xl
    border border-[var(--border-control)]
    bg-[var(--bg-panel)]
    shadow-[0_12px_32px_rgba(50,35,25,0.18)]
`;


function FilterOption({ selected, onClick, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`
                flex min-h-10 w-full items-center justify-between gap-2
                border-b border-[var(--border-control)]
                px-3 py-2 text-left text-[12px]
                transition-colors last:border-b-0
                ${
                    selected
                        ? "bg-[var(--bg-selected)] font-semibold text-[var(--color-brand)]"
                        : "text-[var(--text-primary)] hover:bg-[var(--bg-control-hover)]"
                }
            `}
        >
            <span>{children}</span>
            {selected && <Check size={14} className="shrink-0" />}
        </button>
    );
}


export default function SubHeader({
    variant = "default",

    verses = [],
    chapter,
    setChapter,
    book,
    books = [],
    setBook,
    setSelectedVerse,
    selectedVerse,

    selectedBook,
    setSelectedBook,
    selectedChapter,
    setSelectedChapter,

    searchResults = [],
    commentaryResults = [],
    translation = "BSB"
}) {
    const navigate = useNavigate();

    const [isBookMenuOpen, setIsBookMenuOpen] = useState(false);
    const [isChapterMenuOpen, setIsChapterMenuOpen] = useState(false);
    const [isVerseMenuOpen, setIsVerseMenuOpen] = useState(false);

    const bookFilterRef = useClickOutside(() => {
        setIsBookMenuOpen(false);
    });

    const chapterFilterRef = useClickOutside(() => {
        setIsChapterMenuOpen(false);
    });


    if (variant === "searchResults") {
        // Include chapters represented by either result type.
        const chapters = new Set();

        searchResults.forEach((result) => {
            if (!selectedBook || result.book === selectedBook) {
                chapters.add(result.chapter_number);
            }
        });

        commentaryResults.forEach((result) => {
            if (!selectedBook || result.book === selectedBook) {
                for (
                    let chapter = result.start_chapter;
                    chapter <= result.end_chapter;
                    chapter += 1
                ) {
                    chapters.add(chapter);
                }
            }
        });

        const chapterOptions = [...chapters].sort((a, b) => a - b);

        function selectBook(value) {
            setSelectedBook(value);
            setSelectedChapter("");
            setIsBookMenuOpen(false);
        }

        function selectChapter(value) {
            setSelectedChapter(value);
            setIsChapterMenuOpen(false);
        }

        return (
            <nav
                aria-label="Search filters"
                className="
                    fixed left-0 right-0 top-[58px] z-40
                    flex h-[96px] flex-col justify-center gap-2
                    border-b border-[var(--border)]
                    bg-[var(--bg-nav)] px-3
                    min-[769px]:h-[50px]
                    min-[769px]:flex-row
                    min-[769px]:items-center
                    min-[769px]:justify-start
                    min-[769px]:gap-5
                    min-[769px]:px-9
                "
            >
                <div className="
                    flex w-full items-center justify-between
                    min-[769px]:w-auto
                ">
                    <button
                        type="button"
                        onClick={() => {
                            if (window.history.state?.idx > 0) {
                                navigate(-1);
                            } else {
                                navigate(
                                    `/bible/Genesis/1?translation=${encodeURIComponent(translation)}`
                                );
                            }
                        }}
                        className="
                            group flex h-8 items-center gap-2
                            rounded-lg border border-[var(--border-control)]
                            bg-[var(--bg-panel)] px-3
                            font-serif text-[11px] font-semibold
                            text-[var(--color-brand)] shadow-sm transition
                            hover:border-[var(--color-brand)]
                            hover:bg-[var(--bg-control-hover)]
                        "
                    >
                        <ArrowLeft size={14} />
                        Back to reading
                    </button>

                    <span className="
                        ml-3 rounded-full
                        border border-[var(--border-control)]
                        bg-[var(--bg-panel)] px-3 py-1
                        text-[10px] font-bold text-[var(--color-brand)]
                    ">
                        {translation}
                    </span>
                </div>

                <div className="
                    grid w-full min-w-0 grid-cols-2 gap-2
                    min-[769px]:w-auto
                    min-[769px]:grid-cols-[180px_150px]
                ">
                    {/* Book filter */}
                    <div ref={bookFilterRef} className="relative min-w-0">
                        <button
                            type="button"
                            aria-label="Filter by book"
                            aria-expanded={isBookMenuOpen}
                            onClick={() => {
                                setIsBookMenuOpen(!isBookMenuOpen);
                                setIsChapterMenuOpen(false);
                            }}
                            className={filterButton}
                        >
                            <span className="truncate">
                                {selectedBook || "All books"}
                            </span>

                            <ChevronDown
                                size={14}
                                className={`
                                    shrink-0 transition-transform
                                    ${isBookMenuOpen ? "rotate-180" : ""}
                                `}
                            />
                        </button>

                        {isBookMenuOpen && (
                            <div className={`${menuStyle} left-0 w-[230px]`}>
                                <div className="
                                    max-h-[min(380px,calc(100dvh-220px))]
                                    overflow-y-auto overscroll-contain p-2
                                ">
                                    <div className="
                                        mb-2 overflow-hidden rounded-lg
                                        border border-[var(--border-control)]
                                    ">
                                        <FilterOption
                                            selected={!selectedBook}
                                            onClick={() => selectBook("")}
                                        >
                                            All books
                                        </FilterOption>
                                    </div>

                                    {[
                                        { label: "Old Testament", value: "OT" },
                                        { label: "New Testament", value: "NT" }
                                    ].map((group) => (
                                        <div key={group.value} className="mb-3 last:mb-0">
                                            <div className="
                                                sticky top-0 bg-[var(--bg-panel)]
                                                px-2 py-2 text-[9px] font-bold
                                                uppercase tracking-[1.4px]
                                                text-[var(--color-brand)]
                                            ">
                                                {group.label}
                                            </div>

                                            <div className="
                                                overflow-hidden rounded-lg
                                                border border-[var(--border-control)]
                                            ">
                                                {books
                                                    .filter((item) =>
                                                        item.testament === group.value
                                                    )
                                                    .map((item) => (
                                                        <FilterOption
                                                            key={item.id}
                                                            selected={selectedBook === item.name}
                                                            onClick={() => selectBook(item.name)}
                                                        >
                                                            {item.name}
                                                        </FilterOption>
                                                    ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Chapter filter */}
                    <div ref={chapterFilterRef} className="relative min-w-0">
                        <button
                            type="button"
                            aria-label="Filter by chapter"
                            aria-expanded={isChapterMenuOpen}
                            onClick={() => {
                                setIsChapterMenuOpen(!isChapterMenuOpen);
                                setIsBookMenuOpen(false);
                            }}
                            className={filterButton}
                        >
                            <span className="truncate">
                                {selectedChapter
                                    ? `Chapter ${selectedChapter}`
                                    : "All chapters"
                                }
                            </span>

                            <ChevronDown
                                size={14}
                                className={`
                                    shrink-0 transition-transform
                                    ${isChapterMenuOpen ? "rotate-180" : ""}
                                `}
                            />
                        </button>

                        {isChapterMenuOpen && (
                            <div className={`${menuStyle} right-0 w-[180px]`}>
                                <div className="
                                    max-h-[min(340px,calc(100dvh-220px))]
                                    overflow-y-auto overscroll-contain p-2
                                ">
                                    <div className="
                                        overflow-hidden rounded-lg
                                        border border-[var(--border-control)]
                                    ">
                                        <FilterOption
                                            selected={!selectedChapter}
                                            onClick={() => selectChapter("")}
                                        >
                                            All chapters
                                        </FilterOption>

                                        {chapterOptions.map((chapter) => (
                                            <FilterOption
                                                key={chapter}
                                                selected={Number(selectedChapter) === chapter}
                                                onClick={() => selectChapter(String(chapter))}
                                            >
                                                Chapter {chapter}
                                            </FilterOption>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </nav>
        );
    }


    // Existing Study page navigation.
    return (
        <nav className="
            fixed left-0 right-0 top-[58px] z-40
            flex h-[50px] items-center gap-3
            border-b border-[var(--border)]
            bg-[var(--bg-nav)] px-3
            sm:gap-5 sm:px-5 md:gap-8 md:px-9
        ">
            <BookSelector
                book={book}
                books={books}
                setBook={setBook}
                setChapter={setChapter}
                setSelectedVerse={setSelectedVerse}
                isBookMenuOpen={isBookMenuOpen}
                setIsBookMenuOpen={setIsBookMenuOpen}
                setIsChapterMenuOpen={setIsChapterMenuOpen}
                setIsVerseMenuOpen={setIsVerseMenuOpen}
            />

            <ChapterSelector
                book={book}
                books={books}
                chapter={chapter}
                setChapter={setChapter}
                setSelectedVerse={setSelectedVerse}
                isChapterMenuOpen={isChapterMenuOpen}
                setIsChapterMenuOpen={setIsChapterMenuOpen}
                setIsBookMenuOpen={setIsBookMenuOpen}
                setIsVerseMenuOpen={setIsVerseMenuOpen}
            />

            <VerseSelector
                verses={verses}
                selectedVerse={selectedVerse}
                setSelectedVerse={setSelectedVerse}
                isVerseMenuOpen={isVerseMenuOpen}
                setIsVerseMenuOpen={setIsVerseMenuOpen}
                setIsBookMenuOpen={setIsBookMenuOpen}
                setIsChapterMenuOpen={setIsChapterMenuOpen}
            />

            <span className="
                whitespace-nowrap rounded-full
                border border-[var(--border)]
                bg-[var(--bg-panel)] px-2 py-1
                text-[var(--text-muted)]
                sm:px-3 sm:text-[11px]
            ">
                {verses.length} verses
            </span>
        </nav>
    );
}