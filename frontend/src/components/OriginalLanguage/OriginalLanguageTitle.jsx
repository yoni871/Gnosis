import OriginalLanguageWordTable from "./OriginalLanguageWordTable";
import OriginalLanguageText from "./OriginalLanguageText";

// The chapter title: Psalm superscriptions live at verse 0 in the
// source data (e.g. Psa.3.0 "A psalm of David, when he fled from
// Absalom his son"). Rendered as its own block above verse 1 — never
// merged into verse 1, and kept visually distinct from the reader's
// editorial headings: a small muted label, the original text, and the
// same word-by-word table as a verse.
export default function OriginalLanguageTitle({
    words = [],
    language,
    selectedWordId,
    onSelectWord,
}) {
    const isRtl = language === "hebrew" || language === "aramaic";
    return (
        <section className="gnosis-ol-title" aria-label="Psalm title">
            <p className="gnosis-ol-title-label">Psalm title</p>
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
        </section>
    );
}
