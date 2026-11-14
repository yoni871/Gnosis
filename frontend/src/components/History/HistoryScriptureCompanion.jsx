// The Scripture companion: the biblical passage for one connection,
// read beside the study instead of navigating away.
//
// The passage is fetched with the reader's own passage loader
// (getBibleChapter, the same call the reader and the Scripture previews
// use) in the reader's translations, defaulting to the stored
// public-domain King James Version, then trimmed to the connection's
// exact verse range — whole chapters are never shown when only part of
// one is cited. The companion never changes the active study section:
// opening or closing it leaves the rail/tab state exactly as it was.
// The full passage stays one click away via the reader link in the
// footer. The translation dropdown is the reader's own list
// (getTranslations): switching it refetches the same range in the new
// translation. When the list cannot load, the companion still works in
// KJV.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, X } from "lucide-react";
import { getBibleChapter, getTranslations } from "../../services/bibleService";
import { formatScriptureRange, readerLinkFor } from "../../services/historyService";

const DEFAULT_TRANSLATION = "KJV";

function versesInRange(chapterVerses, chapter, ref) {
    const picked = [];
    for (const verse of chapterVerses ?? []) {
        const number = verse.verse_number ?? verse.verse;
        if (typeof number !== "number") continue;
        const afterStart =
            chapter > ref.startChapter ||
            ref.startVerse === null ||
            ref.startVerse === undefined ||
            number >= ref.startVerse;
        const beforeEnd =
            chapter < ref.endChapter ||
            ref.endVerse === null ||
            ref.endVerse === undefined ||
            number <= ref.endVerse;
        if (afterStart && beforeEnd) {
            picked.push({ chapter, number, text: verse.text });
        }
    }
    return picked;
}

export default function HistoryScriptureCompanion({ passage, onClose, focusCloseOnOpen = true }) {
    const [verses, setVerses] = useState(null);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [retryKey, setRetryKey] = useState(0);
    const [translation, setTranslation] = useState(DEFAULT_TRANSLATION);
    const [translations, setTranslations] = useState([]);
    const closeButtonRef = useRef(null);

    const label = formatScriptureRange(passage);
    const readerLink = readerLinkFor(passage);
    // The dropdown always offers the current translation, even when the
    // fetched list does not contain it (or has not loaded yet) — the
    // select's value must always match an option.
    const translationOptions = translations.some((item) => item.abbreviation === translation)
        ? translations
        : [{
            abbreviation: translation,
            name: translation === DEFAULT_TRANSLATION ? "King James Version" : translation,
        }, ...translations];

    // Focus the close control when the companion opens, so keyboard
    // users land inside it and Escape (handled by the panel) is
    // discoverable; closing returns focus to the Scripture button.
    // The panel suppresses this for the companion it opens by default
    // on mount, so focus stays on the panel's own close button there.
    useEffect(() => {
        if (focusCloseOnOpen) closeButtonRef.current?.focus();
    }, [focusCloseOnOpen]);

    useEffect(() => {
        let cancelled = false;
        getTranslations()
            .then((list) => {
                if (!cancelled) setTranslations(Array.isArray(list) ? list : []);
            })
            .catch(() => {
                if (!cancelled) setTranslations([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!passage) return;
        let cancelled = false;
        // State resets live outside this effect: a new passage remounts
        // the companion (the panel keys it by passage label), a retry
        // resets state in its click handler, and a translation change
        // resets state in the select's change handler, so this effect
        // only fetches and reports the async result.
        const chapters = [];
        for (let chapter = passage.startChapter; chapter <= passage.endChapter; chapter += 1) {
            chapters.push(chapter);
        }
        Promise.all(
            chapters.map((chapter) => getBibleChapter(passage.book, chapter, translation)),
        )
            .then((results) => {
                if (cancelled) return;
                setVerses(results.flatMap((chapterVerses, index) => versesInRange(chapterVerses, chapters[index], passage)));
                setIsLoading(false);
            })
            .catch(() => {
                if (cancelled) return;
                setError("The passage could not be loaded.");
                setIsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [passage, translation, retryKey]);

    return (
        <aside
            id="history-scripture-companion"
            className="history-scripture-companion"
            aria-label={`Scripture companion: ${label}`}
        >
            <header className="history-scripture-companion-header">
                <p className="history-scripture-companion-eyebrow">
                    <BookOpen size={14} aria-hidden="true" />
                    <span>Scripture</span>
                </p>
                <h3 className="history-scripture-companion-title">{label}</h3>
                <button
                    type="button"
                    ref={closeButtonRef}
                    data-testid="history-companion-close"
                    aria-label="Close Scripture companion"
                    className="history-scripture-companion-close"
                    onClick={onClose}
                >
                    <X size={18} aria-hidden="true" />
                </button>
            </header>
            <div className="history-scripture-companion-body">
                {isLoading && (
                    <p className="history-scripture-companion-status" role="status">Loading passage…</p>
                )}
                {error && (
                    <p className="history-scripture-companion-status" role="alert">
                        {error}{" "}
                        <button
                            type="button"
                            className="history-scripture-companion-retry"
                            onClick={() => {
                                setVerses(null);
                                setError("");
                                setIsLoading(true);
                                setRetryKey((key) => key + 1);
                            }}
                        >
                            Try again
                        </button>
                    </p>
                )}
                {!isLoading && !error && verses && verses.length === 0 && (
                    <p className="history-scripture-companion-status" role="status">
                        No verses were found for this passage.
                    </p>
                )}
                {!isLoading && !error && verses && verses.length > 0 && (
                    <div className="history-scripture-companion-verses">
                        {verses.map((verse) => (
                            <p key={`${verse.chapter}:${verse.number}`}>
                                <span className="history-scripture-companion-verse-number" aria-hidden="true">{verse.number}</span>
                                <span className="sr-only">Verse {verse.number}: </span>
                                {verse.text}
                            </p>
                        ))}
                    </div>
                )}
            </div>
            <footer className="history-scripture-companion-footer">
                {readerLink && (
                    <Link to={readerLink}>Open in the reader</Link>
                )}
                <label className="history-companion-translation">
                    <span className="sr-only">Bible translation</span>
                    <select
                        data-testid="history-companion-translation"
                        aria-label="Bible translation"
                        value={translation}
                        disabled={translations.length === 0}
                        onChange={(changeEvent) => {
                            setTranslation(changeEvent.target.value);
                            setVerses(null);
                            setError("");
                            setIsLoading(true);
                        }}
                    >
                        {translationOptions.map((item) => (
                            <option key={item.abbreviation} value={item.abbreviation}>
                                {item.name}
                            </option>
                        ))}
                    </select>
                </label>
            </footer>
        </aside>
    );
}
