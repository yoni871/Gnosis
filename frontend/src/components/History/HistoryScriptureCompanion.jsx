// The Scripture companion: the biblical passage for one connection,
// read beside the study instead of navigating away.
//
// The passage is fetched with the reader's own passage loader
// (getBibleChapter, the same call the reader and the Scripture previews
// use) in the stored public-domain King James Version, then trimmed to
// the connection's exact verse range — whole chapters are never shown
// when only part of one is cited. The companion never changes the
// active study section: opening or closing it leaves the rail/tab state
// exactly as it was. The full passage stays one click away via the
// reader link in the footer.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, X } from "lucide-react";
import { getBibleChapter } from "../../services/bibleService";
import { formatScriptureRange, readerLinkFor } from "../../services/historyService";

const COMPANION_TRANSLATION = "KJV";

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

export default function HistoryScriptureCompanion({ passage, onClose }) {
    const [verses, setVerses] = useState(null);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [retryKey, setRetryKey] = useState(0);
    const closeButtonRef = useRef(null);

    const label = formatScriptureRange(passage);
    const readerLink = readerLinkFor(passage);

    // Focus the close control when the companion opens, so keyboard
    // users land inside it and Escape (handled by the panel) is
    // discoverable; closing returns focus to the Scripture button.
    useEffect(() => {
        closeButtonRef.current?.focus();
    }, []);

    useEffect(() => {
        if (!passage) return;
        let cancelled = false;
        // State resets live outside this effect: a new passage remounts
        // the companion (the panel keys it by passage label) and a retry
        // resets state in its click handler, so this effect only fetches
        // and reports the async result.
        const chapters = [];
        for (let chapter = passage.startChapter; chapter <= passage.endChapter; chapter += 1) {
            chapters.push(chapter);
        }
        Promise.all(
            chapters.map((chapter) => getBibleChapter(passage.book, chapter, COMPANION_TRANSLATION)),
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
    }, [passage, retryKey]);

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
                <span>King James Version</span>
            </footer>
        </aside>
    );
}
