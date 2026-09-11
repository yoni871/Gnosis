import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react";


export default function ScripturePanel({ 
    verses, 
    book, 
    chapter, 
    translation, 
    translations, 
    selectedVerse,
    setTranslation
}) {
    const verseRefs = useRef({});
    const [isTranslationMenuOpen, setIsTranslationMenuOpen] = useState(false);

    useEffect(() => {
        if(selectedVerse) {
            verseRefs.current[selectedVerse]?.scrollIntoView({
                behavior: "smooth",
                block: "center"
            })
        }
    }, [selectedVerse, verses])

  return (
    <section className="
                h-full
                px-[clamp(30px,5vw,75px)]
                max-[768px]:px-[20px]
                bg-[rgba(244,233,205,0.96)]
                shadow-[inset_0_0_20px_rgba(80,55,35,0.12)]
                overflow-hidden
                flex
                flex-col
    ">

        <div className="
                -mx-[clamp(30px,5vw,75px)]
                bg-[rgba(248,239,216,0.96)]
        ">
            <div className="
                    flex
                    items-center
                    justify-between
                    border-b
                    border-[var(--border)]
                    bg-[#f9f4e7]
                    px-[clamp(30px,5vw,75px)]
                    py-[5px]
                    text-[8px]
                    font-bold
                    tracking-[2.5px]
                    text-[var(--muted)]
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
                            bg-[#E8DDC8]
                            px-[10px]
                            py-[6px]
                            font-serif
                            text-[10px]
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
                                min-w-[80px]
                                border
                                border-[var(--border)]
                                bg-[#F5EFE0]
                                p-[5px]
                        ">
                            {translations.map((translationItem) => (
                                <div
                                    key={translationItem.id}
                                    className="
                                        cursor-pointer
                                        px-[9px]
                                        py-[6px]
                                        text-[11px]
                                        hover:bg-[#E8DDC8]
                                    "
                                    onClick={() => {
                                        setTranslation(translationItem.abbreviation);
                                        setIsTranslationMenuOpen(false);
                                    }}
                                >
                                    {translationItem.abbreviation}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
        
            </div>

        </div>

        <div className="
                min-h-0
                flex-1
                overflow-y-auto
                bg-[rgba(244,233,205,0.96)]       
        ">

            <div className="
                    mx-auto
                    mt-[40px]
                    max-w-[550px]
                    grid
                    grid-cols-3
                    border-b-[3px]
                    border-double
                    border-[var(--border)]
                    pb-[5px]
                    text-center
                    text-[10px]
                    tracking-[2px]
                    text-[var(--muted)]
            ">
                <span className="text-left">{book.toUpperCase()}</span>
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
                    text-[var(--muted)]
                ">
                    - CHAPTER {chapter} -
                </p>

                <h2 className="
                    m-0
                    font-serif
                    text-[clamp(26px,2.2vw,34px)]
                    font-normal
                    italic
                    text-[var(--text)]
                ">
                    {book}
                </h2>

                <div className="
                    mt-[15px]
                    text-[13px]
                    tracking-[3px]
                    text-[var(--burgundy)]
                ">
                    ────── † ──────
                </div>
            </div>

            <div className="
                mx-auto
                max-w-[550px]
                text-justify
                text-[1.0625rem]
                leading-[2.05]
                tracking-[0.012em]
                [word-spacing:0.03em]
                text-[#3F3328]
                [font-family:'Lora',Georgia,'Times_New_Roman',serif]
                hyphens-auto
            ">
                {verses.map((verse) => (
                    <p
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
                            ${verse.verse_number === selectedVerse
                                ? "bg-[rgba(239,10,10,0.08)] border-l-[3px] border-[var(--burgundy)] pl-[12px] transition-[background] duration-200 ease-in-out"
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
                        text-[var(--burgundy)]
                    ">
                        {verse.verse_number}
                    </sup>
                    {verse.text}
                    </p>
                ))}
            </div>

        </div>
        
    </section>
  )
}
