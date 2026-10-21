// Accept RGB colors such as "#FFD54F".
function isValidColor(color) {
    return (
        typeof color === "string" &&
        /^#[0-9A-Fa-f]{6}$/.test(color)
    );
}

// Check that passage coordinates are positive integers and in forward order.
function isValidPassage(startChapter, startVerse, endChapter, endVerse) {
    const values = [startChapter, startVerse, endChapter, endVerse];

    // Reject missing values, strings, decimals, zero, and negative numbers.
    const allValid = values.every((value) =>
        Number.isInteger(value) && value > 0
    );

    if (!allValid) {
        return false;
    }

    // Accept a later chapter, or an equal chapter with an equal/later verse.
    return (
        endChapter > startChapter ||
        (
            endChapter === startChapter &&
            endVerse >= startVerse
        )
    );
}

// Accept a nonempty collection of positive integer verse coordinates.
function isValidVerseSelection(verses) {
    return (
        Array.isArray(verses) &&
        verses.length > 0 &&
        verses.every((point) =>
            point !== null &&
            typeof point === "object" &&
            Number.isInteger(point.chapter) &&
            point.chapter > 0 &&
            Number.isInteger(point.verse) &&
            point.verse > 0
        )
    );
}

// Remove repeated coordinates before validating or saving the selection.
function uniqueVerses(verses) {
    const byVerse = new Map();

    for (const point of verses) {
        const key = `${point.chapter}:${point.verse}`;

        byVerse.set(key, point);
    }

    return [...byVerse.values()];
}

module.exports = {
    isValidColor,
    isValidPassage,
    isValidVerseSelection,
    uniqueVerses
};