import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import API_URL from '../../api/api';

export default function ChapterSelector({
    book,
    books,
    chapter,
    setChapter,
    setSelectedVerse,
    isChapterMenuOpen,
    setIsChapterMenuOpen,
    setIsBookMenuOpen,
    setIsVerseMenuOpen
}) {

    const [chapters, setChapters] = useState([]);

    // Fetch the chapters whenever the selected book changes.
    useEffect(() => {
        const bookData = books.find((item) => item.name === book)
        if (!bookData) return;

        fetch(`${API_URL}/books/${bookData.id}/chapters`)
            .then(response => response.json())
            .then(data => {
                setChapters(data)
            })
            .catch(error => {
                console.error(error)
            })
    }, [book, books]);

  return (
    <div className="
        flex
        items-center
        gap-1
        whitespace-nowrap
        text-[var(--text)]

        sm:gap-2
    ">
        <button 
            className="
                flex
                shrink-0
                items-center
                justify-center
                rounded
                p-1
                text-[var(--muted)]
                hover:bg-[#E8DDC8]
            "

            onClick={() => {
                if(chapter > 1) {
                    setChapter(chapter - 1);
                    setSelectedVerse(null);
                }
            }}
        >

            <ChevronLeft size={18} />

        </button>
    <div className="relative">
        <button 
            className="
                whitespace-nowrap
                rounded-md
                px-1
                py-1
                text-[10px]
                font-semibold
                text-[var(--burgundy)]
                sm:px-2
                sm:text-[12px]
                md:text-[13px]
            "
            onClick={() => {
                setIsChapterMenuOpen(!isChapterMenuOpen)
                setIsBookMenuOpen(false);
                setIsVerseMenuOpen(false);
            }}
        >
            Chapter {chapter}
        </button>

        {isChapterMenuOpen && (
            <div className="
                    absolute
                    left-0
                    top-full
                    z-50
                    mt-1
                    max-h-[300px]
                    min-w-[130px]
                    overflow-y-auto
                    rounded-lg
                    border border-[var(--border)]
                    bg-[var(--panel)]
                    p-2
                    shadow-lg
                "
            >
                {chapters.map((item) => (
                    <div 
                        key={item.id}
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
                                item.chapter_number === chapter
                                    ? "bg-[#E8DDC8] font-semibold !text-[#6B1F2A]"
                                    : ""
                            }
                        `}
                        onClick={() => {
                            setChapter(item.chapter_number);
                            setSelectedVerse(null);
                            setIsChapterMenuOpen(false);
                        }}
                    >
                        Chapter {item.chapter_number}
                    </div>
                ))}
            </div>
        )}
    </div>

        <button
            className="
                flex
                shrink-0
                items-center
                justify-center
                rounded
                p-1
                text-[var(--muted)]
                hover:bg-[#E8DDC8]
            "
        
            onClick={() => {
                if(chapter < chapters.length) {
                    setChapter(chapter + 1);
                    setSelectedVerse(null);
                }
            }}
        >

            <ChevronRight size={18} />

        </button>

    </div>
  )
}
