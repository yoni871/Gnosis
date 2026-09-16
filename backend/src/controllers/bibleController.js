//this controller recieves the http request
//talks to the database and sends the response
const bibleService = require("../services/bibleService");

const getBooks = async (req, res) => {
    try {
        const result = await bibleService.getAllBooks();
        res.json(result.rows);
    } catch (error) {
        console.error(error);

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
        console.error(error);
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
        console.error(error);
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
        console.error(error);
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
        console.error(error);
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
        console.error(error);
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
        console.error(error);
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
        console.error(error);
        res.status(500).json({ error: "Failed to retrieve chapter commentaries." });
    }
}

const getVerseCommentaries = async (req, res) => {
    try{
        const result = await bibleService.getCommentariesByChapter(req.params.bookId, req.params.chapterNumber, req.params.verseNumber);
        res.json(result.rows);
    } catch(error) {
        console.error(error);
        res.status(500).json({
            error: "Failed to retrieve chapter verse commentaries."
        });
    }  
}

const getBibleChapter = async (req, res) => {
    const { book, chapter, translation } = req.params;
    try {
        const result = await bibleService.getChapterByBook(book, chapter, translation);
        if(result.rows.length === 0) {
            return res.status(404).json({
                error:  "Chapter not found."
            })
        }
        res.json(result.rows);
    } catch(error) {
        console.error(error);
        res.status(500).json({
            error: "Failed to retrieve chapter."
        });
    }  
}

const getStudy = async (req, res) => {
    const { book, chapter } = req.params;
    const commentaryId = req.query.commentaryId;
    try {
        const result = await bibleService.getStudyByChapter(book, chapter, commentaryId);
        const verses = result.verses.rows;
        const commentaries = result.commentaries.rows;

        if (result.verses.rows.length === 0) {
            return res.status(404).json({
                error: "Chapter not found."
            });
}
        res.json({
            book,
            chapter,
            verses,
            commentaries
        });
    } catch(error) {
        console.error(error);
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