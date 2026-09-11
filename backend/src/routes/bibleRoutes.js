const express = require("express"); //get express package
const router = express.Router();
const { 
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
} = require("../controllers/bibleController");

//gets the books
router.get("/books", getBooks);

//the following gets the chapters from the database
router.get("/books/:bookId/chapters", getChapters);

//the following gets the verse from the database
router.get("/chapters/:chapterId/verses", getVerses);

//the following gets the translations from the database
router.get("/translations", getTranslations);

//gets all available commentaries
router.get("/commentaries", getCommentaries);

//gets the commentary for specific book
router.get("/books/:bookId/commentaries", getBookCommentaries);

//gets all available sources
router.get("/sources", getSources);

// returns the chapter specific commentary
router.get("/books/:bookId/chapters/:chapterNumber/commentaries", getChapterCommentaries);

//verse specific commentary
router.get("/books/:bookId/chapters/:chapterNumber/verses/:verseNumber/commentaries", getVerseCommentaries);

//returns a chapter
router.get("/bible/:book/:chapter/:translation", getBibleChapter);

router.get("/bible/:book/:chapter/study", getStudy);


module.exports = router;

