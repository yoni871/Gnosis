import { ChevronDown } from 'lucide-react';

export default function BookSelector({
    book, 
    books, 
    setBook,
    setChapter,
    setSelectedVerse,
    isBookMenuOpen,
    setIsBookMenuOpen,
    setIsChapterMenuOpen,
    setIsVerseMenuOpen
}) {
    const selectedBook = book;
    
    const oldTestament = books.filter((book) => book.testament === "OT");
    const newTestament = books.filter((book) => book.testament === "NT");

  return (
    <div className="
            relative
            shrink-0
        "
    >
        <button 
            className="
                flex
                shrink-0
                items-center
                gap-1
                whitespace-nowrap
                rounded-md
                px-1
                py-1
                text-[11px]
                font-semibold
                text-[var(--burgundy)]  
                sm:px-2
                sm:text-[13px]
                md:text-[14px]
            "
            onClick={() => {
                setIsBookMenuOpen(!isBookMenuOpen)
                setIsChapterMenuOpen(false);
                setIsVerseMenuOpen(false);
            }}
        >
        {book}
            <ChevronDown size={16} />
        </button>

        {isBookMenuOpen && (
            <div className="
                    absolute
                    left-0
                    top-full
                    z-50
                    mt-1
                    grid
                    grid-cols-2
                    gap-3
                    max-h-[300px]
                    w-[calc(100vw-24px)]
                    max-w-[500px]
                    min-w-0
                    overflow-y-auto
                    rounded-lg
                    border border-[var(--border)]
                    bg-[var(--panel)]
                    p-3
                    shadow-lg

                    sm:gap-5
                    sm:p-4
                "
            >
                <div className="
                        grid
                        w-full
                        min-w-0
                        grid-cols-2
                        gap-1
                    "
                >
                    <h4 className="
                            col-span-2
                            mb-2
                            text-[9px]
                            font-bold
                            tracking-wider
                            text-[var(--muted)]
                        "
                    >
                        OLD TESTAMENT
                    </h4>
                    {oldTestament.map((book) => {
                        return (
                            <div 
                                key={book.id}
                                className={`
                                    cursor-pointer
                                    whitespace-nowrap
                                    rounded
                                    px-2
                                    py-1
                                    text-[11px]
                                    text-[var(--text)]
                                    hover:bg-[#E8DDC8]
                                    ${
                                        book.name === selectedBook
                                            ? "bg-[#E8DDC8] font-semibold !text-[#6B1F2A]"
                                            : ""
                                    }
                                `}
                                onClick={() => {
                                setBook(book.name)
                                setChapter(1)
                                setIsBookMenuOpen(false)
                                setSelectedVerse(null)
                                }}
                            >
                                {book.name}
                            </div>
                        )
                    })}

                    </div>
                    <div className="
                            grid
                            w-full
                            min-w-0
                            grid-cols-2
                            gap-1
                        "
                    >
                        <h4 className="
                                col-span-2
                                mb-2
                                text-[9px]
                                font-bold
                                tracking-wider
                                text-[var(--muted)]
                            "
                        >
                            NEW TESTAMENT
                        </h4>
                        {newTestament.map((book) => {
                            return (
                                <div 
                                    key={book.id}
                                    className={`
                                        cursor-pointer
                                        whitespace-nowrap
                                        rounded
                                        px-2
                                        py-1
                                        text-[11px]
                                        text-[var(--text)]
                                        hover:bg-[#E8DDC8]
                                        ${
                                            book.name === selectedBook
                                                ? "bg-[#E8DDC8] font-semibold !text-[#6B1F2A]"
                                                : ""
                                        }
                                    `}
                                    onClick={() => {
                                    setBook(book.name)
                                    setChapter(1)
                                    setIsBookMenuOpen(false)
                                    setSelectedVerse(null)
                                }}
                                >
                                    {book.name}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )
        }
    </div>
  );
}
