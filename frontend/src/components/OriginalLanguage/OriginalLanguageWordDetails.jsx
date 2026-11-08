// The selected word: original word, transliteration, lemma, Strong's,
// meaning, contextual gloss, and expanded grammar — all from the
// STEPBible data, never invented. The verbatim morphology expansion
// (Tyndale House's own explanation) is shown as labeled pairs.
function splitTopLevel(text, separator) {
    const parts = [];
    let depth = 0;
    let current = "";
    for (const char of text) {
        if (char === "(") depth += 1;
        if (char === ")") depth = Math.max(0, depth - 1);
        if (char === separator && depth === 0) {
            parts.push(current);
            current = "";
        } else {
            current += char;
        }
    }
    parts.push(current);
    return parts;
}

function parseExpansionPairs(expansion) {
    return splitTopLevel(expansion, ";")
        .map((segment) => segment.trim())
        .filter(Boolean)
        .map((segment) => {
            const equals = segment.indexOf("=");
            if (equals === -1) return { label: "", value: segment };
            return { label: segment.slice(0, equals).trim(), value: segment.slice(equals + 1).trim() };
        });
}

import OriginalLanguageOccurrences from "./OriginalLanguageOccurrences";
import { displayGloss, hasGloss } from "./gloss";

const LANGUAGE_LABEL = {
    hebrew: "Biblical Hebrew",
    aramaic: "Biblical Aramaic",
    greek: "Koine Greek",
};

const LANGUAGE_CODE = {
    hebrew: "he",
    aramaic: "arc",
    greek: "el",
};

export default function OriginalLanguageWordDetails({
    word,
    language,
    occurrences,
    occurrencesLoading,
    occurrencesError,
    occurrencesMatch,
    onFindOccurrences,
    onSelectOccurrence,
    onCloseDetail,
}) {
    // Word-level language: in a mixed passage a word carries its own
    // language, never the passage's (e.g. an Aramaic word in Daniel
    // 2:4 renders with Aramaic direction and labelling).
    const wordLanguage = word.language || language;
    const isRtl = wordLanguage === "hebrew" || wordLanguage === "aramaic";
    const wordLangCode = LANGUAGE_CODE[wordLanguage] || (isRtl ? "he" : "el");
    return (
        <div className="gnosis-ol-word-details">
            <div className="gnosis-ol-word-details-heading">
                <p
                    className="gnosis-ol-detail-word"
                    dir={isRtl ? "rtl" : "ltr"}
                    lang={wordLangCode}
                >
                    {word.wordText}
                </p>
                <button
                    type="button"
                    className="gnosis-ol-detail-close"
                    aria-label="Close word details"
                    onClick={onCloseDetail}
                >
                    ✕
                </button>
            </div>
            <p className="gnosis-ol-detail-transliteration">{word.transliteration}</p>

            <dl className="gnosis-ol-definition-list">
                <div>
                    <dt>Language</dt>
                    <dd>{LANGUAGE_LABEL[wordLanguage] || wordLanguage}</dd>
                </div>
                <div>
                    <dt>Lemma</dt>
                    <dd>
                        <span dir={isRtl ? "rtl" : "ltr"} lang={wordLangCode}>{word.lemma}</span>
                        {word.lemmaTransliteration ? ` (${word.lemmaTransliteration})` : ""}
                    </dd>
                </div>
                <div>
                    <dt>Strong’s number</dt>
                    {/* Display the plain Strong's number (H0430). The
                        disambiguated key (H0430G) is an internal
                        lookup key for lemma/occurrence matching and
                        is never shown. */}
                    <dd>{word.strongBase || word.strongNumber}</dd>
                </div>
                <div>
                    <dt>Meaning</dt>
                    <dd>{displayGloss(word.meaning || word.gloss)}</dd>
                </div>
                <div>
                    <dt>In this verse</dt>
                    <dd>{displayGloss(word.gloss)}</dd>
                </div>
                <div>
                    <dt>Grammar</dt>
                    <dd>{word.grammarDisplay}</dd>
                </div>
            </dl>

            {word.morphemes?.length > 0 && (
                <div className="gnosis-ol-morphemes">
                    <h3>How the word is built</h3>
                    {word.morphemes.map((morpheme, index) => (
                        <div key={index} className="gnosis-ol-morpheme">
                            <p className="gnosis-ol-morpheme-word">
                                <span dir={isRtl ? "rtl" : "ltr"} lang={wordLangCode}>
                                    {morpheme.text}
                                </span>
                                {morpheme.isRoot ? " · root" : ""}
                                {hasGloss(morpheme.gloss) ? ` — ${morpheme.gloss}` : ""}
                            </p>
                            <dl className="gnosis-ol-definition-list gnosis-ol-morpheme-pairs">
                                {parseExpansionPairs(morpheme.morphologyExpanded || morpheme.morphologyCode).map((pair, pairIndex) => (
                                    <div key={pairIndex}>
                                        <dt>{pair.label || "Form"}</dt>
                                        <dd>{pair.value}</dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                    ))}
                </div>
            )}

            <div className="gnosis-ol-occurrences">
                <h3>Other occurrences</h3>
                <p className="gnosis-ol-occurrences-note">
                    Searches the same lemma in the imported corpus — Genesis 1 and Philippians 3
                    for Phase 1. “Strong’s” also matches the other senses that share the plain
                    Strong’s number.
                </p>
                <div className="gnosis-ol-occurrences-actions" role="group" aria-label="Occurrence search">
                    <button
                        type="button"
                        className={occurrencesMatch === "lemma" && occurrences ? "is-active" : ""}
                        disabled={occurrencesLoading}
                        onClick={() => onFindOccurrences("lemma")}
                    >
                        Find Other Occurrences
                    </button>
                    <button
                        type="button"
                        className={occurrencesMatch === "strong" && occurrences ? "is-active" : ""}
                        disabled={occurrencesLoading}
                        onClick={() => onFindOccurrences("strong")}
                    >
                        Strong’s matches
                    </button>
                </div>
                {occurrencesLoading && <p role="status">Searching…</p>}
                {occurrencesError && <p role="alert">Couldn’t search occurrences: {occurrencesError}</p>}
                {occurrences && (
                    <OriginalLanguageOccurrences
                        occurrences={occurrences}
                        onSelectOccurrence={onSelectOccurrence}
                    />
                )}
            </div>
        </div>
    );
}
