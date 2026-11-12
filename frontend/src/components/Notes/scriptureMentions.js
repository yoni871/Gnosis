const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function namesForBook(book) {
    if (book.name === "Psalms") return ["Psalms", "Psalm"];
    if (book.name === "Song of Solomon") return [book.name, "Song of Songs"];
    return [book.name];
}

export function parseScriptureMentions(text, books) {
    if (!text || !books?.length) return [{ type: "text", text: text || "" }];
    const aliases = new Map();
    for (const book of books) {
        for (const name of namesForBook(book)) aliases.set(name.toLowerCase(), book);
    }
    const names = [...aliases.keys()].sort((a, b) => b.length - a.length);
    const pattern = new RegExp(
        `\\b(${names.map(escapeRegExp).join("|")})\\s+(\\d+):(\\d+)(?:\\s*[-–—]\\s*(?:(\\d+):)?(\\d+))?`,
        "gi"
    );
    const parts = [];
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
        if (match.index > cursor) parts.push({ type: "text", text: text.slice(cursor, match.index) });
        const book = aliases.get(match[1].toLowerCase());
        const startChapter = Number(match[2]);
        const startVerse = Number(match[3]);
        const endChapter = match[4] ? Number(match[4]) : startChapter;
        const endVerse = match[5] ? Number(match[5]) : startVerse;
        const valid = startChapter > 0 && startVerse > 0 && endChapter > 0 && endVerse > 0
            && (!book.chapter_count || (startChapter <= book.chapter_count && endChapter <= book.chapter_count))
            && (endChapter > startChapter || (endChapter === startChapter && endVerse >= startVerse));
        parts.push(valid ? {
            type: "reference",
            text: match[0],
            book: book.name,
            bookId: book.id,
            startChapter,
            startVerse,
            endChapter,
            endVerse
        } : { type: "text", text: match[0] });
        cursor = match.index + match[0].length;
    }
    if (cursor < text.length) parts.push({ type: "text", text: text.slice(cursor) });
    return parts.length ? parts : [{ type: "text", text }];
}
