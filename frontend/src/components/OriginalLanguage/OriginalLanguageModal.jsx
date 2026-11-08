import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import {
    getOriginalLanguagePassage,
    getLemmaOccurrences,
} from "../../services/originalLanguageService";
import OriginalLanguagePassage from "./OriginalLanguagePassage";
import OriginalLanguageTitle from "./OriginalLanguageTitle";
import OriginalLanguageVerse from "./OriginalLanguageVerse";
import OriginalLanguageWordDetails from "./OriginalLanguageWordDetails";
import "./OriginalLanguageModal.css";

const LANGUAGE_LABEL = {
    hebrew: "Biblical Hebrew",
    aramaic: "Biblical Aramaic",
    greek: "Koine Greek",
};

// Short names for the mixed-language subtitle ("Original Languages:
// Hebrew & Aramaic"), which lists every language in the passage
// instead of classifying it as one.
const LANGUAGE_SHORT_LABEL = {
    hebrew: "Hebrew",
    aramaic: "Aramaic",
    greek: "Greek",
};

function formatLanguages(languages) {
    if (!languages || languages.length === 0) return null;
    if (languages.length === 1) return LANGUAGE_LABEL[languages[0]] || languages[0];
    return `Original Languages: ${languages.map((code) => LANGUAGE_SHORT_LABEL[code] || code).join(" & ")}`;
}

function formatRange(book, chapter, startVerse, endVerse) {
    return startVerse === endVerse
        ? `${book} ${chapter}:${startVerse}`
        : `${book} ${chapter}:${startVerse}–${endVerse}`;
}

// The seeded attribution already names the licence ("…STEPBible.org),
// CC BY 4.0"), so appending it again renders it twice —
// "CC BY 4.0 (CC BY 4.0)". Append each licence only when it is not
// already part of the attribution text.
function formatAttribution(sources) {
    const attributions = [...new Set(sources.map((source) => source.attribution))];
    const licenses = [...new Set(sources.map((source) => source.license).filter(Boolean))];
    const missing = licenses.filter(
        (license) => !attributions.some((attribution) => attribution.includes(license))
    );
    const text = attributions.join(" ");
    return missing.length > 0 ? `${text} (${missing.join(", ")}).` : `${text}.`;
}

// Focusable selectors for the focus trap.
const FOCUSABLE =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function OriginalLanguageModal({
    book,
    chapter,
    startVerse,
    endVerse,
    englishVerses = [],
    translation = "",
    onClose,
    onNavigateToVerse,
}) {
    const [passage, setPassage] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedWord, setSelectedWord] = useState(null);
    const [occurrences, setOccurrences] = useState(null);
    const [occurrencesLoading, setOccurrencesLoading] = useState(false);
    const [occurrencesError, setOccurrencesError] = useState("");
    const [occurrencesMatch, setOccurrencesMatch] = useState("lemma");

    const dialogRef = useRef(null);
    const previouslyFocusedRef = useRef(null);

    // Load the original-language passage for the selected range.
    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        setError("");
        setPassage(null);
        setSelectedWord(null);
        setOccurrences(null);
        getOriginalLanguagePassage(book, chapter, startVerse, endVerse)
            .then((data) => {
                if (cancelled) return;
                setPassage(data);
                setIsLoading(false);
            })
            .catch((fetchError) => {
                if (cancelled) return;
                setError(fetchError.message);
                setIsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [book, chapter, startVerse, endVerse]);

    // Dialog semantics: remember the opener, focus the dialog, trap Tab,
    // close on Escape, lock background scroll, restore focus on close.
    useEffect(() => {
        previouslyFocusedRef.current = document.activeElement;
        const dialog = dialogRef.current;
        const closeButton = dialog?.querySelector("[data-testid='ol-close']");
        closeButton?.focus();
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        function onKeyDown(event) {
            if (event.key === "Escape") {
                event.stopPropagation();
                onClose();
                return;
            }
            if (event.key !== "Tab" || !dialog) return;
            const focusable = [...dialog.querySelectorAll(FOCUSABLE)]
                .filter((element) => element.offsetParent !== null);
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
        document.addEventListener("keydown", onKeyDown, true);
        return () => {
            document.removeEventListener("keydown", onKeyDown, true);
            document.body.style.overflow = previousOverflow;
            previouslyFocusedRef.current?.focus?.();
        };
    }, [onClose]);

    const loadOccurrences = useCallback(async (word, match) => {
        if (!word?.strongNumber) return;
        setOccurrencesLoading(true);
        setOccurrencesError("");
        setOccurrencesMatch(match);
        try {
            const data = await getLemmaOccurrences(word.strongNumber, { match, limit: 20 });
            setOccurrences(data);
        } catch (fetchError) {
            setOccurrencesError(fetchError.message);
            setOccurrences(null);
        } finally {
            setOccurrencesLoading(false);
        }
    }, []);

    // Very common lemmas have thousands of occurrences; the panel
    // pages through them 20 at a time instead of rendering them all.
    const loadMoreOccurrences = useCallback(async () => {
        if (!selectedWord?.strongNumber || !occurrences || occurrencesLoading) return;
        setOccurrencesLoading(true);
        setOccurrencesError("");
        try {
            const data = await getLemmaOccurrences(selectedWord.strongNumber, {
                match: occurrencesMatch,
                limit: 20,
                offset: occurrences.occurrences.length,
            });
            setOccurrences((current) => current
                ? { ...current, occurrences: [...current.occurrences, ...data.occurrences], offset: data.offset }
                : data);
        } catch (fetchError) {
            setOccurrencesError(fetchError.message);
        } finally {
            setOccurrencesLoading(false);
        }
    }, [selectedWord, occurrences, occurrencesMatch, occurrencesLoading]);

    const handleSelectWord = useCallback((word) => {
        setSelectedWord(word);
        setOccurrences(null);
        setOccurrencesError("");
    }, []);

    const handleSelectOccurrence = useCallback((occurrence) => {
        // The occurrence carries its own book, chapter and verse:
        // the reader navigates to it. An occurrence in the passage
        // already open just refocuses that verse (the navigation
        // handler decides that from the reference).
        onClose();
        onNavigateToVerse?.(occurrence);
    }, [onClose, onNavigateToVerse]);

    const language = passage?.language;
    const languageText = formatLanguages(passage?.languages) ||
        (language ? LANGUAGE_LABEL[language] || language : null);
    const subtitle = languageText
        ? `${formatRange(book, chapter, startVerse, endVerse)} · ${languageText}`
        : formatRange(book, chapter, startVerse, endVerse);

    return createPortal(
        <div
            className="gnosis-ol-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label="Original Language Analysis"
                className="gnosis-ol-dialog"
            >
                <header className="gnosis-ol-header">
                    <div>
                        <h2 className="gnosis-ol-title">Original Language Analysis</h2>
                        <p className="gnosis-ol-subtitle">{subtitle}</p>
                    </div>
                    <button
                        type="button"
                        data-testid="ol-close"
                        aria-label="Close original language analysis"
                        className="gnosis-ol-close"
                        onClick={onClose}
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </header>

                <div className="gnosis-ol-main">
                    <div className="gnosis-ol-analysis">
                        {isLoading && (
                            <p className="gnosis-ol-status" role="status">
                                Loading the original-language text…
                            </p>
                        )}
                        {!isLoading && error && (
                            <p className="gnosis-ol-status" role="alert">
                                Couldn’t load the original-language text: {error}
                            </p>
                        )}
                        {!isLoading && !error && passage && !passage.available && (
                            <p className="gnosis-ol-status" role="status">
                                {passage.note || "Original-language data is not available for this passage yet."}
                            </p>
                        )}
                        {!isLoading && !error && passage?.available && (
                            <>
                                <OriginalLanguagePassage
                                    book={book}
                                    chapter={chapter}
                                    startVerse={startVerse}
                                    endVerse={endVerse}
                                    verses={englishVerses}
                                    translation={translation}
                                />
                                {passage.title && (
                                    <OriginalLanguageTitle
                                        words={passage.title.words}
                                        language={language}
                                        selectedWordId={selectedWord?.id ?? null}
                                        onSelectWord={handleSelectWord}
                                    />
                                )}
                                {passage.verses.map((verse) => (
                                    <OriginalLanguageVerse
                                        key={verse.verse}
                                        verse={verse.verse}
                                        words={verse.words}
                                        noOriginalText={verse.noOriginalText}
                                        language={language}
                                        selectedWordId={selectedWord?.id ?? null}
                                        onSelectWord={handleSelectWord}
                                    />
                                ))}
                                {passage.sources?.length > 0 && (
                                    <p className="gnosis-ol-attribution">
                                        {formatAttribution(passage.sources)}
                                        {" "}Source:{" "}
                                        <a href={passage.sources[0].url} target="_blank" rel="noreferrer">
                                            STEPBible-Data
                                        </a>
                                    </p>
                                )}
                            </>
                        )}
                    </div>

                    <aside className="gnosis-ol-detail" aria-label="Selected word">
                        {selectedWord ? (
                            <OriginalLanguageWordDetails
                                word={selectedWord}
                                language={language}
                                occurrences={occurrences}
                                occurrencesLoading={occurrencesLoading}
                                occurrencesError={occurrencesError}
                                occurrencesMatch={occurrencesMatch}
                                onFindOccurrences={(match) => loadOccurrences(selectedWord, match)}
                                onLoadMoreOccurrences={loadMoreOccurrences}
                                onSelectOccurrence={handleSelectOccurrence}
                                onCloseDetail={() => handleSelectWord(null)}
                            />
                        ) : (
                            <p className="gnosis-ol-status">
                                Select a word to see its lemma, meaning, and grammar.
                            </p>
                        )}
                    </aside>
                </div>
            </div>
        </div>,
        document.body
    );
}
