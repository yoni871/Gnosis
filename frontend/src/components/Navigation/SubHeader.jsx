import { useState } from 'react';
import BookSelector from './BookSelector';
import ChapterSelector from './ChapterSelector';
import VerseSelector from './VerseSelector';

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
    searchResults
 }) {
    const[isBookMenuOpen, setIsBookMenuOpen] = useState(false);
    const[isChapterMenuOpen, setIsChapterMenuOpen] = useState(false);
    const[isVerseMenuOpen, setIsVerseMenuOpen] = useState(false);

    
if(variant === "searchResults") {
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
            overflow-hidden
            border-b
            border-[var(--border)]
            bg-[#f9f4e7]
            px-3

            sm:gap-3
            sm:px-5

            md:gap-5
            md:px-9
        ">
            {/* Back to reading button */}
            <button className="
                shrink-0
                whitespace-nowrap
                border-none
                bg-transparent
                font-serif
                text-[11px]
                font-semibold
                text-[var(--burgundy)]
                hover:underline

                sm:text-[12px]
            ">
                ‹ Back to reading
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
                    text-[var(--muted)]
                    sm:text-[11px]
                ">
                    Filter:
                </span>

                <select
                    className="
                        h-7
                        min-w-[110px]
                        rounded-md
                        border
                        border-[#D8CBB5]
                        bg-[#F8F2E6]
                        px-2.5
                        text-[10px]
                        font-medium
                        text-[var(--text)]
                        shadow-sm
                        outline-none
                        transition
                        hover:bg-[#EEE4D3]
                        focus:border-[var(--burgundy)]
                        focus:ring-1
                        focus:ring-[var(--burgundy)]
                        sm:text-[11px]
                    "
                    value={selectedBook}
                    onChange={(event) => setSelectedBook(event.target.value)}
                >
                    <option value="">All books</option>
                    {books.map((book) => (
                        <option
                            key={book.id}
                            value={book.name}
                        >
                            {book.name}
                        </option>
                    ))}
                </select>

                {/* Chapter filter */}
                <div className="
                    flex
                    items-center
                    gap-2
                    shrink-0
                ">
                    <select
                        value={selectedChapter}
                        onChange={(event) => setSelectedChapter(event.target.value)}
                        className="                            
                            h-7
                            min-w-[105px]
                            rounded-md
                            border
                            border-[#D8CBB5]
                            bg-[#F8F2E6]
                            px-2.5
                            text-[10px]
                            font-medium
                            text-[var(--text)]
                            shadow-sm
                            outline-none
                            transition
                            hover:bg-[#EEE4D3]
                            focus:border-[var(--burgundy)]
                            focus:ring-1
                            focus:ring-[var(--burgundy)]
                            sm:text-[11px]
                        "
                    >
                        <option value="">All chapters</option>
                        {[...new Set(
                            searchResults.filter((result) => {
                                if(!selectedBook) {
                                    return true;
                                }

                                    return result.book === selectedBook;
                                })
                                .map((result) => result.chapter_number)
                        )].sort((a, b) => a-b).map((chapter) => (
                            <option
                                key={chapter}
                                value={chapter}
                            >
                                Chapter {chapter}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Translation badge */}
            <div className="
                shrink-0
                whitespace-nowrap
                rounded-full
                border
                border-[#D8CBB5]
                bg-[var(--panel)]
                px-2.5
                py-1
                text-[9px]
                font-bold
                tracking-wide
                text-[var(--burgundy)]
                shadow-sm
                sm:px-3
                sm:py-1.5
                sm:text-[10px]
            ">
                BSB
            </div>
        </nav>
    )
}

return (
    <nav
        className="
            fixed
            top-[50px]
            left-0
            right-0
            z-40
            flex h-[50px]
            items-center
            gap-3
            border-b border-[var(--border)]
            bg-[#f9f4e7]
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
            bg-[var(--panel)]
            px-2 py-1
            text-[9px]
            text-[var(--muted)]

            sm:px-3
            sm:text-[11px]
        "
    >
        {verses.length} verses
    </span>

   </nav>
  );
}
