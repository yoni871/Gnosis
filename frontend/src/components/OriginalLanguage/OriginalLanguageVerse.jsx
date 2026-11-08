import { useState } from "react";
import { ChevronDown } from "lucide-react";

import OriginalLanguageWordTable from "./OriginalLanguageWordTable";
import OriginalLanguageText from "./OriginalLanguageText";

// One verse: the original-language text, then the word-by-word table.
// Collapsible; expanded by default. A verse with no original-language
// words in an imported chapter is an NA28 gap (Romans 16:25–27,
// 2 Corinthians 13:13–14, Philippians 1:16–17, John 7:53): it renders
// an explanation, never an empty table, and no text is invented for it.
export default function OriginalLanguageVerse({
    verse,
    words = [],
    noOriginalText = false,
    language,
    selectedWordId,
    onSelectWord,
}) {
    const [isExpanded, setIsExpanded] = useState(true);
    const isRtl = language === "hebrew" || language === "aramaic";
    return (
        <section className="gnosis-ol-verse" aria-label={`Verse ${verse}`}>
            <button
                type="button"
                className="gnosis-ol-verse-heading"
                aria-expanded={isExpanded}
                onClick={() => setIsExpanded((expanded) => !expanded)}
            >
                <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={`gnosis-ol-verse-chevron ${isExpanded ? "is-open" : ""}`}
                />
                <span>Verse {verse}</span>
            </button>
            {isExpanded && noOriginalText && (
                <p className="gnosis-ol-status">
                    No original-language text for this verse in the NA28 edition.
                </p>
            )}
            {isExpanded && !noOriginalText && (
                <>
                    <p
                        className="gnosis-ol-original-text"
                        dir={isRtl ? "rtl" : "ltr"}
                        lang={isRtl ? "he" : "el"}
                    >
                        <OriginalLanguageText words={words} language={language} />
                    </p>
                    <OriginalLanguageWordTable
                        words={words}
                        language={language}
                        selectedWordId={selectedWordId}
                        onSelectWord={onSelectWord}
                    />
                </>
            )}
        </section>
    );
}
