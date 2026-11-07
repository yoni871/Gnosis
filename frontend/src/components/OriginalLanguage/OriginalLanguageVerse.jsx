import { useState } from "react";
import { ChevronDown } from "lucide-react";

import OriginalLanguageWordTable from "./OriginalLanguageWordTable";
import OriginalLanguageText from "./OriginalLanguageText";

// One verse: the original-language text, then the word-by-word table.
// Collapsible; expanded by default.
export default function OriginalLanguageVerse({
    verse,
    words = [],
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
            {isExpanded && (
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
