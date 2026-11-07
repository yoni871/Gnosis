// The original-language line for a verse (or a Psalm title): the words
// in source order, each with its own direction and language so a mixed
// Hebrew/Aramaic line is labelled word by word. Maqqef-joined words
// print without a space between them.
const LANGUAGE_CODE = {
    hebrew: "he",
    aramaic: "arc",
    greek: "el",
};

export default function OriginalLanguageText({ words = [], language }) {
    const children = [];
    words.forEach((word, index) => {
        if (index > 0 && !words[index - 1].wordText.endsWith("־")) children.push(" ");
        const wordLanguage = word.language || language;
        const wordIsRtl = wordLanguage === "hebrew" || wordLanguage === "aramaic";
        children.push(
            <span
                key={word.id}
                dir={wordIsRtl ? "rtl" : "ltr"}
                lang={LANGUAGE_CODE[wordLanguage] || (wordIsRtl ? "he" : "el")}
            >
                {word.wordText}
            </span>
        );
    });
    return <>{children}</>;
}
