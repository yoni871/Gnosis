// The Scripture column of the Doctrine workspace: the passage for the
// selected reference, read beside the historical interpretation.
//
// The passage is fetched with the reader's own passage loader
// (getBibleChapter, the same call the reader and the History Scripture
// companion use) in the selected translation — KJV by default — then
// trimmed to the passage's exact verse range. Whole chapters are never
// shown when only part of one is cited. The panel never changes the
// active interpretation: changing the translation re-fetches the same
// passage, and the full passage stays one click away via the reader
// link in the footer.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getBibleChapter } from "../../services/bibleService";
import { readerLinkFor } from "../../services/historyService";

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

export default function DoctrineScripturePanel({
    passage,
    translation = "KJV",
    translations = [],
    onTranslationChange,
}) {
    const [verses, setVerses] = useState(null);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [retryKey, setRetryKey] = useState(0);

    const readerLink = readerLinkFor(passage);
    const selectedTranslation = translations.find((item) => item.abbreviation === translation);
    const translationName =
        selectedTranslation?.name ??
        (translation === "KJV" ? "King James Version" : translation);

    useEffect(() => {
        if (!passage) return;
        let cancelled = false;
        // State resets live outside this effect: a new passage or
        // translation remounts the panel (the workspace keys it by
        // passage + translation) and a retry resets state in its click
        // handler, so this effect only fetches and reports the async
        // result — the same pattern as the History Scripture companion.
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
        <section className="doctrine-scripture-panel" aria-label={`Scripture: ${passage.label}`}>
            <header className="doctrine-panel-header">
                <p className="doctrine-panel-eyebrow">Scripture</p>
                <h2 className="doctrine-panel-title">{passage.label}</h2>
                <label className="doctrine-translation-label" htmlFor="doctrine-translation-select">
                    Translation
                </label>
                <select
                    id="doctrine-translation-select"
                    className="doctrine-translation-select"
                    value={translation}
                    onChange={(event) => onTranslationChange?.(event.target.value)}
                >
                    {translations.length === 0 ? (
                        <option value="KJV">KJV</option>
                    ) : (
                        translations.map((item) => (
                            <option key={item.abbreviation} value={item.abbreviation}>
                                {item.abbreviation}
                            </option>
                        ))
                    )}
                </select>
            </header>
            <div className="doctrine-scripture-body">
                {isLoading && (
                    <p className="doctrine-scripture-status" role="status">Loading passage…</p>
                )}
                {error && (
                    <p className="doctrine-scripture-status" role="alert">
                        {error}{" "}
                        <button
                            type="button"
                            className="doctrine-scripture-retry"
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
                    <p className="doctrine-scripture-status" role="status">
                        No verses were found for this passage.
                    </p>
                )}
                {!isLoading && !error && verses && verses.length > 0 && (
                    <div className="doctrine-scripture-verses">
                        {verses.map((verse) => (
                            <p key={`${verse.chapter}:${verse.number}`}>
                                <span className="doctrine-scripture-verse-number" aria-hidden="true">{verse.number}</span>
                                <span className="sr-only">Verse {verse.number}: </span>
                                {verse.text}
                            </p>
                        ))}
                    </div>
                )}
            </div>
            <footer className="doctrine-scripture-footer">
                {readerLink && (
                    <Link to={readerLink}>Open in the reader</Link>
                )}
                <span>{translationName}</span>
            </footer>
        </section>
    );
}
