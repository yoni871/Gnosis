// Word-by-word table: original word, transliteration, meaning
// (contextual gloss), and expanded grammar. Every row selects its word.
import { useEffect, useRef, useState } from "react";

import { displayGloss, hasGloss } from "./gloss";

// The accessible name joins the word, transliteration, and gloss with
// commas — but a word that already ends in punctuation (e.g. the Greek
// "κερδήσω,") would come out doubled ("κερδήσω,, kerdēsō …"), so the
// trailing punctuation is dropped from the word first. A word with no
// standalone gloss contributes no gloss part at all.
function accessibleName(word) {
    const parts = [
        word.wordText.replace(/[,.;:·]+$/, ""),
        word.transliteration,
        hasGloss(word.gloss) ? word.gloss : null,
    ].filter(Boolean);
    return parts.join(", ");
}

const LANGUAGE_CODE = {
    hebrew: "he",
    aramaic: "arc",
    greek: "el",
};

const LANGUAGE_SHORT_LABEL = {
    hebrew: "Hebrew",
    aramaic: "Aramaic",
    greek: "Greek",
};

export default function OriginalLanguageWordTable({
    words = [],
    language,
    selectedWordId,
    onSelectWord,
}) {
    const wrapRef = useRef(null);
    // The table is wider than its container on narrow screens, so it
    // scrolls sideways — but nothing says so. Show a subtle hint only
    // while there are hidden columns to the right; it disappears once
    // the user has scrolled to the end (or when nothing is hidden).
    const [showSwipeHint, setShowSwipeHint] = useState(false);
    useEffect(() => {
        const wrap = wrapRef.current;
        if (!wrap) return undefined;
        const update = () => {
            setShowSwipeHint(wrap.scrollWidth - wrap.clientWidth - wrap.scrollLeft > 1);
        };
        update();
        wrap.addEventListener("scroll", update, { passive: true });
        // ResizeObserver is unavailable in jsdom (and very old
        // browsers); the scroll listener alone still covers scrolling.
        // Observe the table as well as the wrap: on the production
        // build the webfont can arrive after mount, widening the table
        // without resizing the wrap — without this the hint would never
        // appear even though columns are hidden.
        const table = wrap.querySelector("table");
        const observer = typeof ResizeObserver !== "undefined"
            ? new ResizeObserver(update)
            : null;
        if (observer) {
            observer.observe(wrap);
            if (table) observer.observe(table);
        }
        return () => {
            wrap.removeEventListener("scroll", update);
            observer?.disconnect();
        };
    }, [words]);

    return (
        <div className="gnosis-ol-table-container">
            <div className="gnosis-ol-table-wrap" ref={wrapRef}>
                <table className="gnosis-ol-table">
                    <thead>
                        <tr>
                            <th scope="col">Word</th>
                            <th scope="col">Transliteration</th>
                            <th scope="col">Meaning</th>
                            <th scope="col">Grammar</th>
                        </tr>
                    </thead>
                    <tbody>
                        {words.map((word) => {
                            const isSelected = word.id === selectedWordId;
                            // Word-level language: in a mixed passage a
                            // word carries its own language, never the
                            // passage's. A word whose language differs
                            // from the verse's gets a small tag so the
                            // mix is visible in the table itself.
                            const wordLanguage = word.language || language;
                            const wordIsRtl = wordLanguage === "hebrew" || wordLanguage === "aramaic";
                            const showLanguageTag = word.language && word.language !== language;
                            return (
                                <tr
                                    key={word.id}
                                    className={isSelected ? "is-selected" : ""}
                                    aria-selected={isSelected}
                                    onClick={() => onSelectWord(word)}
                                >
                                    <td>
                                        <button
                                            type="button"
                                            className="gnosis-ol-word-button"
                                            dir={wordIsRtl ? "rtl" : "ltr"}
                                            lang={LANGUAGE_CODE[wordLanguage] || (wordIsRtl ? "he" : "el")}
                                            aria-label={accessibleName(word)}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onSelectWord(word);
                                            }}
                                        >
                                            {word.wordText}
                                        </button>
                                        {showLanguageTag && (
                                            <span className="gnosis-ol-word-language">
                                                {LANGUAGE_SHORT_LABEL[word.language] || word.language}
                                            </span>
                                        )}
                                    </td>
                                    <td className="gnosis-ol-transliteration">{word.transliteration}</td>
                                    <td>{displayGloss(word.gloss)}</td>
                                    <td>{word.grammarDisplay}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {showSwipeHint && (
                <p className="gnosis-ol-swipe-hint" aria-hidden="true">
                    Swipe to see more →
                </p>
            )}
        </div>
    );
}
