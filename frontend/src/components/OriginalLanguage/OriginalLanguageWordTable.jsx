// Word-by-word table: original word, transliteration, meaning
// (contextual gloss), and expanded grammar. Every row selects its word.
export default function OriginalLanguageWordTable({
    words = [],
    language,
    selectedWordId,
    onSelectWord,
}) {
    const isRtl = language === "hebrew" || language === "aramaic";
    return (
        <div className="gnosis-ol-table-wrap">
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
                                        dir={isRtl ? "rtl" : "ltr"}
                                        lang={isRtl ? "he" : "el"}
                                        aria-label={`${word.wordText}, ${word.transliteration}, ${word.gloss}`}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onSelectWord(word);
                                        }}
                                    >
                                        {word.wordText}
                                    </button>
                                </td>
                                <td className="gnosis-ol-transliteration">{word.transliteration}</td>
                                <td>{word.gloss}</td>
                                <td>{word.grammarDisplay}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
