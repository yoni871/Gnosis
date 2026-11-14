//this controller recieves the http request
//talks to the database and sends the response
const bibleService = require("../services/bibleService");
const licensedTranslations = require("../services/licensed/licensedTranslations");
const { logControllerError } = require("../utils/authErrors");

// Licensed translations are temporarily unavailable as a whole, never
// per-verse: the reader answers this by falling back to BSB.
const LICENSED_UNAVAILABLE_BODY = {
    error: "This translation is temporarily unavailable.",
    code: "LICENSED_UNAVAILABLE",
};

const getBooks = async (req, res) => {
    try {
        const result = await bibleService.getAllBooks();
        res.json(result.rows);
    } catch (error) {
        logControllerError("bible.books", "database", error);

        res.status(500).json({
            error: "Failed to retrieve books"
        });
    }
};

const getChapters = async (req, res) => {
    try {
        const result = await bibleService.getAllChapters(req.params.bookId);
        res.json(result.rows);
    } catch(error) {
        logControllerError("bible.chapters", "database", error);
        res.status(500).json({
            error: "Failed to retrieve chapters."
        });
    }
};

const getVerses = async (req, res) => {
    try {
        const result = await bibleService.getVersesByChapter(req.params.chapterId, req.query.translationId);
        res.json(result.rows);
    } catch(error) {
        logControllerError("bible.verses", "database", error);
        res.status(500).json({
            error: "Failed to retrieve verses."
        });
    }
}

const getTranslations = async (req, res) => {
    try {
        const result = await bibleService.getAllTranslations();
        res.json(result.rows);
    } catch(error) {
        logControllerError("bible.translations", "database", error);
        res.status(500).json({
            error: "Failed to retrieve translations."
        });
    }
}

const getCommentaries = async (req, res) => {
    try {
        const result = await bibleService.getAllCommentaries();
        res.json(result.rows);
    } catch(error) {
        logControllerError("bible.commentaries", "database", error);
        res.status(500).json({
            error: "Failed to retrieve commentaries."
        });
    }
}

const getBookCommentaries = async (req, res) => {
    try {
        const result = await bibleService.getCommentariesByBook(req.params.bookId);
        res.json(result.rows);
    } catch(error) {
        logControllerError("bible.book-commentaries", "database", error);
        res.status(500).json({
            error: "Failed to retrieve book commentaries."
        });
    }
}

const getSources = async (req, res) => {
    try {
        const result = await bibleService.getAllSources();
        res.json(result.rows);
    } catch(error) {
        logControllerError("bible.sources", "database", error);
        res.status(500).json({
            error: "Failed to retrieve sources."
        });
    }
}

const getChapterCommentaries = async (req, res) => {
    try {

        // Get the commentary ID from the query string.
        const commentaryId = req.query.commentaryId;

        const result = await bibleService.getCommentariesByChapter(
            req.params.bookId,
            req.params.chapterNumber,
            commentaryId
        );

        res.json(result.rows);

    } catch (error) {
        logControllerError("bible.chapter-commentaries", "database", error);
        res.status(500).json({ error: "Failed to retrieve chapter commentaries." });
    }
}

const getVerseCommentaries = async (req, res) => {
    try{
        const result = await bibleService.getCommentariesByChapter(req.params.bookId, req.params.chapterNumber, req.params.verseNumber);
        res.json(result.rows);
    } catch(error) {
        logControllerError("bible.verse-commentaries", "database", error);
        res.status(500).json({
            error: "Failed to retrieve chapter verse commentaries."
        });
    }  
}

const getBibleChapter = async (req, res) => {
    const { book, chapter, translation } = req.params;
    try {
        const translationRow = await bibleService.getTranslationByAbbreviation(translation);
        if (!translationRow) {
            return res.status(404).json({
                error:  "Chapter not found."
            })
        }
        // Resolve the :book segment to its canonical name first, so
        // lowercase / uppercase / mixed-case spellings all work and
        // every downstream consumer sees the canonical name. An
        // unknown book 404s exactly as before.
        const canonicalBook = await bibleService.resolveBookName(book);
        if (!canonicalBook) {
            return res.status(404).json({
                error:  "Chapter not found."
            })
        }
        const canonicalName = canonicalBook.name;
        // Licensed translations come from the publisher's API (with a
        // bounded 30-day cache), never from bible_verses. The response
        // rows match the stored-translation shape exactly, so the reader
        // needs no special case for them.
        if (translationRow.source !== "database") {
            if (!translationRow.enabled
                || !licensedTranslations.isProviderConfigured(translationRow)) {
                return res.status(503).json(LICENSED_UNAVAILABLE_BODY);
            }
            const chapterNumber = Number(chapter);
            if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
                return res.status(404).json({
                    error:  "Chapter not found."
                })
            }
            try {
                const { verses } = await licensedTranslations.getLicensedChapter(
                    translationRow,
                    canonicalName,
                    chapterNumber,
                    req.ip
                );
                return res.json(verses.map((verse) => ({
                    verse_number: verse.verse_number,
                    text: verse.text,
                    chapter_number: chapterNumber,
                    book: canonicalName,
                })));
            } catch (error) {
                // Only the route, kind, and safe code reach the server
                // log (audit F02); the reader only learns the
                // translation is unavailable right now.
                logControllerError("bible.chapter", "licensed-provider", error);
                return res.status(503).json(LICENSED_UNAVAILABLE_BODY);
            }
        }
        const result = await bibleService.getChapterByBook(canonicalName, chapter, translation);
        if(result.rows.length === 0) {
            return res.status(404).json({
                error:  "Chapter not found."
            })
        }
        res.json(result.rows);
    } catch(error) {
        logControllerError("bible.chapter", "database", error);
        res.status(500).json({
            error: "Failed to retrieve chapter."
        });
    }
}

const getStudy = async (req, res) => {
    const { book, chapter } = req.params;
    const commentaryId = req.query.commentaryId;
    try {
        // Same canonical resolution as the chapter endpoint: the
        // study lookup keys on the book name too.
        const canonicalBook = await bibleService.resolveBookName(book);
        if (!canonicalBook) {
            return res.status(404).json({
                error: "Chapter not found."
            });
        }
        const canonicalName = canonicalBook.name;
        const result = await bibleService.getStudyByChapter(canonicalName, chapter, commentaryId);
        const verses = result.verses.rows;
        const commentaries = result.commentaries.rows;

        if (result.verses.rows.length === 0) {
            return res.status(404).json({
                error: "Chapter not found."
            });
}
        res.json({
            book: canonicalName,
            chapter,
            verses,
            commentaries
        });
    } catch(error) {
        logControllerError("bible.study", "database", error);
        res.status(500).json({
            error: "Failed to retrieve chapter."
        });
    }  
}

module.exports = {
    getBooks,
    getChapters,
    getVerses,
    getTranslations,
    getCommentaries,
    getBookCommentaries,
    getSources,
    getChapterCommentaries,
    getVerseCommentaries,
    getBibleChapter,
    getStudy
};