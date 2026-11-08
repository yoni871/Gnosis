// Original Language Analysis (Phase 1) — see docs/OriginalLanguage.md.
const originalLanguageService = require("../services/originalLanguageService");

// Phase 2 covers the full canon; the API says so instead of
// pretending a passage is covered when it is not.
const CORPUS_NOTE = "Original-language corpus: the full 66-book canon.";

const SOURCE_CODES_BY_LANGUAGE = {
    hebrew: ["STEPBible-TAHOT", "STEPBible-TBESH", "STEPBible-TEHMC"],
    // Aramaic shares the Hebrew sources (TAHOT/TBESH/TEHMC all cover
    // Aramaic); there is no separate Aramaic source to look up.
    aramaic: ["STEPBible-TAHOT", "STEPBible-TBESH", "STEPBible-TEHMC"],
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
        // No words in the requested range: either the chapter was
        // never imported (available: false, as before) or every
        // requested verse is a gap — a verse that exists in the
        // English Bible but has no words in the base text STEPBible
        // uses. The nineteen gap chapters (25 verses): Romans 16:24–27,
        // 2 Corinthians 13:13–14, Philippians 1:16–17, John 7:53,
        // John 5:4, Acts 8:37, Acts 15:34, Acts 24:7, Acts 28:29,
        // Mark 7:16, Mark 9:44 and 9:46, Luke 17:36, Luke 23:17,
        // Matthew 17:21, Matthew 18:11, Matthew 23:14, Mark 11:26,
        // Mark 15:28, Joshua 21:36–37 (the last two are type R in
        // TAHOT — absent from the Leningrad Codex main text). The
        // chapter word count tells them apart: a gap verse is
        // reported, never invented.
        const chapterWordCount = rows.length === 0
            ? await originalLanguageService.getChapterWordCount(bookRow.id, chapterNumber)
            : null;
        if (rows.length === 0 && chapterWordCount === 0) {
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
        // Every verse in the requested range is reported, in order.
        // A verse with no imported words in an imported chapter is an
        // NA28 gap: it carries noOriginalText instead of an empty word
        // list, so the modal explains the absence rather than showing
        // an empty table or an error. (After the full import, the only
        // such verses are the 25 verses in the 19 gap chapters; the
        // dry-run validation fails the import if any other verse is
        // missing.)
        const versesByNumber = new Map();
        for (const row of rows) {
            let verse = versesByNumber.get(row.verse_number);
            if (!verse) {
                verse = { verse: row.verse_number, words: [] };
                versesByNumber.set(row.verse_number, verse);
            }
            verse.words.push(shapeWord(row));
        }
        const verses = [];
        for (let verseNumber = startVerse; verseNumber <= finalEndVerse; verseNumber++) {
            const verse = versesByNumber.get(verseNumber);
            verses.push(verse || { verse: verseNumber, words: [], noOriginalText: true });
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

module.exports = { getPassage, getWord, getLemmaOccurrences };
