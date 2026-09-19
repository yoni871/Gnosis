import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Check } from 'lucide-react';
import BookSelector from './BookSelector';
import ChapterSelector from './ChapterSelector';
import VerseSelector from './VerseSelector';
import useClickOutside from '../../hooks/useClickOutside';

export default function SubHeader({ 
    variant = "default",
    verses,
    chapter,
    setChapter,
    book,
    books,
    setBook,
    setSelectedVerse,
    selectedVerse,
    selectedBook,
    setSelectedBook,
    selectedChapter,
    setSelectedChapter,
    searchResults,
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
        return (
            <nav className="
                fixed
                top-[50px]
                left-0
                right-0
                z-40
                flex
                h-[50px]
                min-w-0
                items-center
                gap-2
                overflow-visible
                border-b
                border-[var(--border)]
                bg-[var(--bg-nav)]
                px-3

                sm:gap-3
                sm:px-5

                md:gap-5
                md:px-9
            ">
                {/* Back to reading button */}
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="
                        group
                        flex
                        h-8
                        shrink-0
                        items-center
                        gap-2
                        whitespace-nowrap
                        rounded-lg
                        border
                        border-[var(--border-control)]
                        bg-[var(--bg-panel)]
                        px-3
                        font-serif
                        text-[11px]
                        font-semibold
                        text-[var(--color-brand)]
                        shadow-sm
                        transition-all
                        duration-200
                        hover:border-[var(--color-brand)]
                        hover:bg-[var(--bg-control-hover)]
                        hover:shadow-md
                        sm:text-[12px]
                    "
                >
                    <ArrowLeft
                        size={14}
                        className="
                            transition-transform
                            duration-200
                            group-hover:-translate-x-0.5
                        "
                    />

                    <span>Back to reading</span>
                </button>

                {/* Book filter */}
                <div className="
                    flex
                    items-center
                    gap-1.5
                    shrink-0
                    sm:gap-2
                ">
                    <span className="
                        shrink-0
                        text-[10px]
                        font-semibold
                        tracking-wide
                        text-[var(--text-muted)]
                        sm:text-[11px]
                    ">
                        Filter:
                    </span>

                    <div
                        ref={bookFilterRef}
                        className="relative"
                    >
                        <button
                            type="button"
                            onClick={() => {
                                setIsBookMenuOpen(!isBookMenuOpen);
                                setIsChapterMenuOpen(false);
                            }}
                            className="
                                flex
                                h-8
                                min-w-[135px]
                                items-center
                                justify-between
                                gap-3
                                rounded-lg
                                border
                                border-[var(--border-control)]
                                bg-[var(--bg-panel)]
                                px-3
                                text-[11px]
                                font-medium
                                text-[var(--text-primary)]
                                shadow-sm
                                transition
                                hover:border-[var(--color-brand)]
                                hover:bg-[var(--bg-control-hover)]
                            "
                        >
                            <span>{selectedBook || "All books"}</span>

                            <ChevronDown
                                size={14}
                                className={`
                                    text-[var(--text-muted)]
                                    transition-transform
                                    duration-200
                                    ${isBookMenuOpen ? "rotate-180" : ""}
                                `}
                            />
                        </button>

                        {isBookMenuOpen && (
                            <div className="
                                absolute
                                left-0
                                top-[calc(100%+6px)]
                                z-50
                                w-[210px]
                                overflow-hidden
                                rounded-xl
                                border
                                border-[var(--border-control)]
                                bg-[var(--bg-panel)]
                                shadow-[0_12px_32px_rgba(50,35,25,0.18)]
                            ">
                                <div className="
                                    border-b
                                    border-[var(--border-control)]
                                    px-3
                                    py-2
                                    text-[9px]
                                    font-bold
                                    uppercase
                                    tracking-[1.5px]
                                    text-[var(--text-muted)]
                                ">
                                    Filter by book
                                </div>

                                <div className="
                                    max-h-[380px]
                                    overflow-y-auto
                                    p-2
                                ">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedBook("");
                                            setSelectedChapter("");
                                            setIsBookMenuOpen(false);
                                        }}
                                        className={`
                                            mb-2
                                            flex
                                            w-full
                                            items-center
                                            justify-between
                                            rounded-lg
                                            border
                                            border-[var(--border-control)]
                                            px-3
                                            py-2
                                            text-left
                                            text-[11px]
                                            transition-colors
                                            ${
                                                selectedBook === ""
                                                    ? "bg-[var(--bg-selected)] font-semibold text-[var(--color-brand)]"
                                                    : "text-[var(--text-primary)] hover:bg-[var(--bg-control-hover)]"
                                            }
                                        `}
                                    >
                                        <span>All books</span>
                                        {selectedBook === "" && <Check size={13} />}
                                    </button>

                                    {[
                                        {
                                            label: "Old Testament",
                                            books: books.filter((bookItem) => bookItem.testament === "OT")
                                        },
                                        {
                                            label: "New Testament",
                                            books: books.filter((bookItem) => bookItem.testament === "NT")
                                        }
                                    ].map((group) => (
                                        <div
                                            key={group.label}
                                            className="mb-3 last:mb-0"
                                        >
                                            <div className="
                                                sticky
                                                top-0
                                                z-10
                                                bg-[var(--bg-panel)]
                                                px-2
                                                py-2
                                                text-[9px]
                                                font-bold
                                                uppercase
                                                tracking-[1.4px]
                                                text-[var(--color-brand)]
                                            ">
                                                {group.label}
                                            </div>

                                            <div className="
                                                overflow-hidden
                                                rounded-lg
                                                border
                                                border-[var(--border-control)]
                                            ">
                                                {group.books.map((bookItem) => {
                                                    const isSelected = selectedBook === bookItem.name;

                                                    return (
                                                        <button
                                                            type="button"
                                                            key={bookItem.id}
                                                            onClick={() => {
                                                                setSelectedBook(bookItem.name);
                                                                setSelectedChapter("");
                                                                setIsBookMenuOpen(false);
                                                            }}
                                                            className={`
                                                                flex
                                                                w-full
                                                                items-center
                                                                justify-between
                                                                border-b
                                                                border-[var(--border-control)]
                                                                px-3
                                                                py-2
                                                                text-left
                                                                text-[11px]
                                                                transition-colors
                                                                last:border-b-0
                                                                ${
                                                                    isSelected
                                                                        ? "bg-[var(--bg-selected)] font-semibold text-[var(--color-brand)]"
                                                                        : "bg-[var(--bg-panel)] text-[var(--text-primary)] hover:bg-[var(--bg-control-hover)]"
                                                                }
                                                            `}
                                                        >
                                                            <span>{bookItem.name}</span>
                                                            {isSelected && <Check size={13} />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
</div>
                            </div>
                        )}
                    </div>

                    {/* Chapter filter */}
                    <div
                        ref={chapterFilterRef}
                        className="relative shrink-0"
                    >
                        <button
                            type="button"
                            onClick={() => {
                                setIsChapterMenuOpen(!isChapterMenuOpen);
                                setIsBookMenuOpen(false);
                            }}
                            className="
                                flex
                                h-8
                                min-w-[135px]
                                items-center
                                justify-between
                                gap-3
                                rounded-lg
                                border
                                border-[var(--border-control)]
                                bg-[var(--bg-panel)]
                                px-3
                                text-[11px]
                                font-medium
                                text-[var(--text-primary)]
                                shadow-sm
                                transition
                                hover:border-[var(--color-brand)]
                                hover:bg-[var(--bg-control-hover)]
                            "
                        >
                            <span>
                                {selectedChapter
                                    ? `Chapter ${selectedChapter}`
                                    : "All chapters"}
                            </span>

                            <ChevronDown
                                size={14}
                                className={`
                                    text-[var(--text-muted)]
                                    transition-transform
                                    duration-200
                                    ${isChapterMenuOpen ? "rotate-180" : ""}
                                `}
                            />
                        </button>

                        {isChapterMenuOpen && (
                            <div className="
                                absolute
                                left-0
                                top-[calc(100%+6px)]
                                z-50
                                w-[165px]
                                overflow-hidden
                                rounded-xl
                                border
                                border-[var(--border-control)]
                                bg-[var(--bg-panel)]
                                shadow-[0_12px_32px_rgba(50,35,25,0.18)]
                            ">
                                <div className="
                                    border-b
                                    border-[var(--border-control)]
                                    px-3
                                    py-2
                                    text-[9px]
                                    font-bold
                                    uppercase
                                    tracking-[1.5px]
                                    text-[var(--text-muted)]
                                ">
                                    Filter by chapter
                                </div>

                                <div className="
                                    max-h-[340px]
                                    overflow-y-auto
                                    p-2
                                ">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedChapter("");
                                            setIsChapterMenuOpen(false);
                                        }}
                                        className={`
                                            mb-2
                                            flex
                                            w-full
                                            items-center
                                            justify-between
                                            rounded-lg
                                            border
                                            border-[var(--border-control)]
                                            px-3
                                            py-2
                                            text-left
                                            text-[11px]
                                            transition-colors
                                            ${
                                                selectedChapter === ""
                                                    ? "bg-[var(--bg-selected)] font-semibold text-[var(--color-brand)]"
                                                    : "text-[var(--text-primary)] hover:bg-[var(--bg-control-hover)]"
                                            }
                                        `}
                                    >
                                        <span>All chapters</span>
                                        {selectedChapter === "" && <Check size={13} />}
                                    </button>

                                    <div className="
                                        overflow-hidden
                                        rounded-lg
                                        border
                                        border-[var(--border-control)]
                                    ">
                                        {[...new Set(
                                            searchResults
                                                .filter((result) => {
                                                    if (!selectedBook) {
                                                        return true;
                                                    }

                                                    return result.book === selectedBook;
                                                })
                                                .map((result) => result.chapter_number)
                                        )]
                                            .sort((a, b) => a - b)
                                            .map((chapterNumber) => {
                                                const isSelected =
                                                    Number(selectedChapter) === chapterNumber;

                                                return (
                                                    <button
                                                        type="button"
                                                        key={chapterNumber}
                                                        onClick={() => {
                                                            setSelectedChapter(
                                                                String(chapterNumber)
                                                            );
                                                            setIsChapterMenuOpen(false);
                                                        }}
                                                        className={`
                                                            flex
                                                            w-full
                                                            items-center
                                                            justify-between
                                                            border-b
                                                            border-[var(--border-control)]
                                                            px-3
                                                            py-2
                                                            text-left
                                                            text-[11px]
                                                            transition-colors
                                                            last:border-b-0
                                                            ${
                                                                isSelected
                                                                    ? "bg-[var(--bg-selected)] font-semibold text-[var(--color-brand)]"
                                                                    : "bg-[var(--bg-panel)] text-[var(--text-primary)] hover:bg-[var(--bg-control-hover)]"
                                                            }
                                                        `}
                                                    >
                                                        <span>Chapter {chapterNumber}</span>
                                                        {isSelected && <Check size={13} />}
                                                    </button>
                                                );
                                            })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Translation badge */}
                <div className="
                    shrink-0
                    whitespace-nowrap
                    rounded-full
                    border
                    border-[var(--border-control)]
                    bg-[var(--bg-panel)]
                    px-2.5
                    py-1
                    text-[9px]
                    font-bold
                    tracking-wide
                    text-[var(--color-brand)]
                    shadow-sm
                    sm:px-3
                    sm:py-1.5
                    sm:text-[10px]
                ">
                    {translation}
                </div>
            </nav>
        )
    }

    return (
        <nav
            className="
                fixed
                top-[58px]
                left-0
                right-0
                z-40
                flex h-[50px]
                items-center
                gap-3
                border-b border-[var(--border)]
                bg-[var(--bg-nav)]
                px-3

                sm:gap-5
                sm:px-5

                md:gap-8
                md:px-9
            "
        >

            {/* Book selector */}
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

            {/* Chapter selector */}
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

            {/* Verse selector */}
            <VerseSelector 
                verses={verses}
                selectedVerse={selectedVerse}
                setSelectedVerse={setSelectedVerse}
                isVerseMenuOpen={isVerseMenuOpen}
                setIsVerseMenuOpen={setIsVerseMenuOpen}
                setIsBookMenuOpen={setIsBookMenuOpen}
                setIsChapterMenuOpen={setIsChapterMenuOpen}
            />

            {/* Number of verses in the current chapter */}
            <span
                className="
                    whitespace-nowrap
                    rounded-full
                    border border-[var(--border)]
                    bg-[var(--bg-panel)]
                    px-2 py-1
                    text-[var(--text-muted)]

                    sm:px-3
                    sm:text-[11px]
                "
            >
                {verses.length} verses
            </span>

        </nav>
    );
}