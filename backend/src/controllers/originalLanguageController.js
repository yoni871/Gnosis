// Original Language Analysis (Phase 1) — see docs/OriginalLanguage.md.
const originalLanguageService = require("../services/originalLanguageService");

// Phase 1 covers only these passages; the API says so instead of
// pretending a passage is covered when it is not.
const PHASE_1_COVERAGE = [
    { book: "Genesis", chapter: 1, language: "hebrew" },
    { book: "Philippians", chapter: 3, language: "greek" },
];
const CORPUS_NOTE = "Phase 1 corpus: Genesis 1 and Philippians 3 only.";

const SOURCE_CODES_BY_LANGUAGE = {
    hebrew: ["STEPBible-TAHOT", "STEPBible-TBESH", "STEPBible-TEHMC"],
    greek: ["STEPBible-TAGNT", "STEPBible-TBESG", "STEPBible-TEGMC"],
};

const MAX_VERSES_PER_REQUEST = 50;
const MAX_CHAPTER = 150;
const MAX_VERSE = 176;
const MAX_OCCURRENCES_LIMIT = 100;
const DEFAULT_OCCURRENCES_LIMIT = 20;
const CONTEXT_WORDS = 3;

function parsePositiveInt(value, fallback = null) {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) return NaN;
    return parsed;
}

function languageForTestament(testament) {
    return testament === "OT" ? "hebrew" : "greek";
}

function shapeWord(row) {
    return {
        id: row.id,
        wordIndex: row.word_index,
        language: row.language,
        wordText: row.word_text,
        transliteration: row.transliteration,
        gloss: row.gloss,
        strongNumber: row.strong_number,
        strongBase: row.strong_base,
        lemma: row.lemma,
        lemmaTransliteration: row.lemma_transliteration,
        meaning: row.meaning,
        lexicalMorphology: row.lexical_morphology,
        morphologyCode: row.morphology_code,
        grammarDisplay: row.grammar_display,
        morphemes: row.morphemes,
    };
}

const getPassage = async (req, res) => {
    try {
        const { book, chapter } = req.params;
        const chapterNumber = parsePositiveInt(chapter);
        const startVerse = parsePositiveInt(req.query.startVerse, 1);
        const endVerse = parsePositiveInt(req.query.endVerse, null);
        if (Number.isNaN(chapterNumber) || chapterNumber > MAX_CHAPTER ||
            Number.isNaN(startVerse) || startVerse > MAX_VERSE ||
            (req.query.endVerse !== undefined && (Number.isNaN(endVerse) || endVerse > MAX_VERSE))) {
            return res.status(400).json({ error: "Chapter and verse numbers must be positive integers." });
        }
        if (endVerse !== null && endVerse < startVerse) {
            return res.status(400).json({ error: "endVerse must not be before startVerse." });
        }
        const finalEndVerse = endVerse === null ? startVerse : endVerse;
        if (finalEndVerse - startVerse + 1 > MAX_VERSES_PER_REQUEST) {
            return res.status(400).json({ error: `At most ${MAX_VERSES_PER_REQUEST} verses per request.` });
        }
        const bookRow = await originalLanguageService.getBookByName(book);
        if (!bookRow) {
            return res.status(404).json({ error: "Book not found." });
        }
        const language = languageForTestament(bookRow.testament);
        const rows = await originalLanguageService.getPassageWords(
            bookRow.id, chapterNumber, startVerse, finalEndVerse);
        const sources = await originalLanguageService.getSources(SOURCE_CODES_BY_LANGUAGE[language]);
        if (rows.length === 0) {
            return res.json({
                book: bookRow.name,
                chapter: chapterNumber,
                language,
                languages: [language],
                startVerse,
                endVerse: finalEndVerse,
                available: false,
                title: null,
                verses: [],
                sources,
                note: `Original-language data is not available for this passage yet. ${CORPUS_NOTE}`,
            });
        }
        // The chapter title (Psalm superscriptions at verse 0) belongs
        // to the chapter, not to any verse: fetch it only when the
        // requested range starts at verse 1, and return it separately.
        let title = null;
        let titleRows = [];
        if (startVerse === 1) {
            titleRows = await originalLanguageService.getTitleWords(bookRow.id, chapterNumber);
            if (titleRows.length > 0) title = { words: titleRows.map(shapeWord) };
        }
        // Languages actually present in the passage, in first-appearance
        // order — a mixed Hebrew/Aramaic passage lists both, so the
        // modal never classifies it as one language.
        const languages = [];
        for (const row of [...titleRows, ...rows]) {
            if (!languages.includes(row.language)) languages.push(row.language);
        }
        const verses = [];
        for (const row of rows) {
            let verse = verses.find(entry => entry.verse === row.verse_number);
            if (!verse) {
                verse = { verse: row.verse_number, words: [] };
                verses.push(verse);
            }
            verse.words.push(shapeWord(row));
        }
        res.json({
            book: bookRow.name,
            chapter: chapterNumber,
            language,
            languages,
            startVerse,
            endVerse: finalEndVerse,
            available: true,
            title,
            verses,
            sources,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to retrieve original-language passage." });
    }
};

const getWord = async (req, res) => {
    try {
        const id = parsePositiveInt(req.params.id);
        if (Number.isNaN(id)) {
            return res.status(400).json({ error: "Word id must be a positive integer." });
        }
        const row = await originalLanguageService.getWordById(id);
        if (!row) {
            return res.status(404).json({ error: "Word not found." });
        }
        const language = row.language;
        const sources = await originalLanguageService.getSources(SOURCE_CODES_BY_LANGUAGE[language]);
        res.json({
            id: row.id,
            book: row.book,
            chapter: row.chapter_number,
            verse: row.verse_number,
            wordIndex: row.word_index,
            language,
            wordText: row.word_text,
            transliteration: row.transliteration,
            gloss: row.gloss,
            strongNumber: row.strong_number,
            strongBase: row.strong_base,
            lemma: row.lemma,
            lemmaTransliteration: row.lemma_transliteration,
            meaning: row.meaning,
            lexicalMorphology: row.lexical_morphology,
            morphologyCode: row.morphology_code,
            grammarDisplay: row.grammar_display,
            morphemes: row.morphemes,
            sources,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to retrieve word." });
    }
};

const getLemmaOccurrences = async (req, res) => {
    try {
        const strong = (req.params.strong || "").toUpperCase();
        if (!/^[HG][0-9]+[A-Z]?$/.test(strong)) {
            return res.status(400).json({ error: "Strong's number must look like H7225, H7225G or G1108." });
        }
        const match = req.query.match === "strong" ? "strong" : "lemma";
        const limit = parsePositiveInt(req.query.limit, DEFAULT_OCCURRENCES_LIMIT);
        const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
        if (Number.isNaN(limit) || limit > MAX_OCCURRENCES_LIMIT ||
            !Number.isInteger(offset) || offset < 0) {
            return res.status(400).json({ error: `limit must be 1–${MAX_OCCURRENCES_LIMIT} and offset a non-negative integer.` });
        }
        const entry = await originalLanguageService.getLexicalEntry(strong);
        if (!entry) {
            return res.status(404).json({ error: "No lexical entry for this Strong's number." });
        }
        const { total, rows } = await originalLanguageService.getOccurrences({
            strongNumber: strong, strongBase: entry.strong_base, match, limit, offset,
        });
        const refs = [...new Map(rows.map(row =>
            [`${row.book_id}:${row.chapter_number}:${row.verse_number}`,
                { bookId: row.book_id, chapter: row.chapter_number, verse: row.verse_number }])).values()];
        const verseWords = await originalLanguageService.getVerseWords(refs);
        const byVerse = new Map();
        for (const word of verseWords) {
            const key = `${word.book_id}:${word.chapter_number}:${word.verse_number}`;
            if (!byVerse.has(key)) byVerse.set(key, []);
            byVerse.get(key).push(word);
        }
        const occurrences = rows.map(row => {
            const key = `${row.book_id}:${row.chapter_number}:${row.verse_number}`;
            const words = byVerse.get(key) || [];
            const position = words.findIndex(word => word.word_index === row.word_index);
            const before = words.slice(Math.max(0, position - CONTEXT_WORDS), position).map(word => word.word_text);
            const after = words.slice(position + 1, position + 1 + CONTEXT_WORDS).map(word => word.word_text);
            return {
                id: row.id,
                book: row.book,
                chapter: row.chapter_number,
                verse: row.verse_number,
                wordIndex: row.word_index,
                language: row.language,
                wordText: row.word_text,
                transliteration: row.transliteration,
                gloss: row.gloss,
                strongNumber: row.strong_number,
                strongBase: row.strong_base,
                lemma: row.lemma,
                grammarDisplay: row.grammar_display,
                context: { before, after },
            };
        });
        const language = entry.language;
        const sources = await originalLanguageService.getSources(SOURCE_CODES_BY_LANGUAGE[language]);
        res.json({
            strong,
            strongBase: entry.strong_base,
            lemma: entry.lemma,
            transliteration: entry.transliteration,
            meaning: entry.gloss,
            match,
            total,
            limit,
            offset,
            occurrences,
            corpus: CORPUS_NOTE,
            sources,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to retrieve occurrences." });
    }
};

module.exports = { getPassage, getWord, getLemmaOccurrences, PHASE_1_COVERAGE };
