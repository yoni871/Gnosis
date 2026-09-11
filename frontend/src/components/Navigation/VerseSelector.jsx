
import { ChevronDown } from 'lucide-react';

export default function VerseSelector({
    verses,
    selectedVerse,
    setSelectedVerse,
    isVerseMenuOpen,
    setIsVerseMenuOpen,
    setIsBookMenuOpen,
    setIsChapterMenuOpen
}) {
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
                text-[10px]
                font-semibold
                text-[var(--burgundy)]
                sm:px-2
                sm:text-[12px]
                md:text-[13px]
            "
            onClick={() => {
                setIsVerseMenuOpen(!isVerseMenuOpen)
                setIsBookMenuOpen(false);
                setIsChapterMenuOpen(false);
            }}
        >
            {selectedVerse ? `Verse ${selectedVerse}` : "Verse"} 
            <ChevronDown size={14} />
        </button>

        {isVerseMenuOpen && (
            <div className="
                    absolute
                    left-0
                    top-full
                    z-50
                    mt-1
                    max-h-[300px]
                    min-w-[120px]
                    overflow-y-auto
                    rounded-lg
                    border border-[var(--border)]
                    bg-[var(--panel)]
                    p-2
                    shadow-lg
                "
            >
                {verses.map((verse) => (
                    <div 
                        key={verse.verse_number}
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
                                verse.verse_number === selectedVerse
                                    ? "bg-[#E8DDC8] font-semibold !text-[#6B1F2A]"
                                    : ""
                            }
                        `}
                        onClick={() => {
                            setSelectedVerse(verse.verse_number);
                            setIsVerseMenuOpen(false);
                        }}
                    >
                        Verse {verse.verse_number}
                    </div>
                ))}
            </div>
        )}
    </div>
  )
}
