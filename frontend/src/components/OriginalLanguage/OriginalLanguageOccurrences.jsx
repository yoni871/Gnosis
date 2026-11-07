// Occurrences of the selected lemma (or Strong's number) in the
// imported corpus, with the surrounding original-language words as
// context. Each occurrence navigates the reader to its verse.
export default function OriginalLanguageOccurrences({ occurrences, onSelectOccurrence }) {
    if (occurrences.total === 0) {
        return <p>No other occurrences in the imported corpus.</p>;
    }
    return (
        <div>
            <p>
                {occurrences.total} occurrence{occurrences.total === 1 ? "" : "s"}
                {occurrences.match === "strong" ? " sharing this Strong’s number" : " of this lemma"}
                {occurrences.total > occurrences.occurrences.length
                    ? ` (showing ${occurrences.occurrences.length})`
                    : ""}
                .
            </p>
            <ul className="gnosis-ol-occurrence-list">
                {occurrences.occurrences.map((occurrence) => (
                    <li key={occurrence.id}>
                        <button
                            type="button"
                            className="gnosis-ol-occurrence"
                            onClick={() => onSelectOccurrence(occurrence)}
                        >
                            <span className="gnosis-ol-occurrence-ref">
                                {occurrence.book} {occurrence.chapter}:{occurrence.verse}
                                {occurrences.match === "strong" ? ` · ${occurrence.strongNumber}` : ""}
                            </span>
                            <span
                                className="gnosis-ol-occurrence-context"
                                dir={occurrence.language === "hebrew" || occurrence.language === "aramaic" ? "rtl" : "ltr"}
                            >
                                {[...occurrence.context.before, occurrence.wordText, ...occurrence.context.after].join(" ")}
                            </span>
                            <span className="gnosis-ol-occurrence-gloss">{occurrence.gloss}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
