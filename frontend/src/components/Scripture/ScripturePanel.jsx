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
    const scriptureScrollRef = useRef(null);
    const [isTranslationMenuOpen, setIsTranslationMenuOpen] = useState(false);

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
                        </p>
                    ))}
                </div>

            </div>

        </section>
    )
}