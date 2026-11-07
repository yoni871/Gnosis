// The selected passage in the reader's current translation, from the
// verses the reader already loaded — never hardcoded.
export default function OriginalLanguagePassage({
    book,
    chapter,
    startVerse,
    endVerse,
    verses = [],
    translation = "",
}) {
    const range = startVerse === endVerse
        ? `${book} ${chapter}:${startVerse}`
        : `${book} ${chapter}:${startVerse}–${endVerse}`;
    return (
        <section className="gnosis-ol-passage" aria-label={`English passage, ${range}`}>
            <p className="gnosis-ol-passage-heading">
                {range}
                {translation && <span className="gnosis-ol-passage-translation"> · {translation}</span>}
            </p>
            {verses.length === 0 ? (
                <p className="gnosis-ol-passage-text">The English text for this passage is not loaded.</p>
            ) : (
                <p className="gnosis-ol-passage-text">
                    {verses.map((verse) => (
                        <span key={verse.verse_number}>
                            <sup className="gnosis-ol-verse-number">{verse.verse_number}</sup>
                            {verse.text}{" "}
                        </span>
                    ))}
                </p>
            )}
        </section>
    );
}
