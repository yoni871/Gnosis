import { ChevronDown } from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';

export default function VerseSelector({
    verses,
    selectedVerse,
    setSelectedVerse,
    isVerseMenuOpen,
    setIsVerseMenuOpen,
    setIsBookMenuOpen,
    setIsChapterMenuOpen
}) {

    const dropdownRef = useClickOutside(() => {
        setIsVerseMenuOpen(false)
    })

    return (
        <div 
        ref={dropdownRef}
        className="
            relative
            shrink-0
        ">
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
                    text-[var(--color-brand)]
                    sm:px-2
                    sm:text-[12px]
                    md:text-[13px]
                "
                onClick={() => {
                    setIsVerseMenuOpen(!isVerseMenuOpen);
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
                    border
                    border-[var(--border)]
                    bg-[var(--bg-panel)]
                    p-2
                    shadow-lg
                ">
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
                                text-[var(--text-primary)]
                                hover:bg-[var(--bg-control-hover)]
                                ${
                                    verse.verse_number === selectedVerse
                                        ? "bg-[var(--bg-control-hover)] font-semibold !text-[var(--color-brand)]"
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
    );
}