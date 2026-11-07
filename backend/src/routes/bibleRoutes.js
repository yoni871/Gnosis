const express = require("express"); //get express package
const router = express.Router();
const { cacheControl } = require("../middleware/cacheHeaders");
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

// Reference data changes only on deploy or import, so the edge may
// serve it for an hour (browsers revalidate after a minute). This is
// what the reader re-fetches on every mount.
const cacheReference = cacheControl({ maxAge: 60, sMaxAge: 3600, staleWhileRevalidate: 300 });

//gets the books
router.get("/books", cacheReference, getBooks);

//the following gets the chapters from the database
router.get("/books/:bookId/chapters", getChapters);

//the following gets the verse from the database
router.get("/chapters/:chapterId/verses", getVerses);

//the following gets the translations from the database
router.get("/translations", cacheReference, getTranslations);

//gets all available commentaries
router.get("/commentaries", cacheReference, getCommentaries);

//gets the commentary for specific book
router.get("/books/:bookId/commentaries", getBookCommentaries);

//gets all available sources
router.get("/sources", cacheReference, getSources);

// returns the chapter specific commentary
router.get("/books/:bookId/chapters/:chapterNumber/commentaries", getChapterCommentaries);

//verse specific commentary
router.get("/books/:bookId/chapters/:chapterNumber/verses/:verseNumber/commentaries", getVerseCommentaries);

//returns a chapter
router.get("/bible/:book/:chapter/:translation", getBibleChapter);

router.get("/bible/:book/:chapter/study", getStudy);

// Original Language Analysis (Phase 1): mounted here (not app.js) so
// the routes live with the other Bible routes.
router.use("/original-language", require("./originalLanguageRoutes"));


module.exports = router;

