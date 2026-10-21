import { useEffect, useRef, useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";

import { getBooks, getBibleChapter, getTranslations } from "../services/bibleService";

import Header from "../components/Header/Header";
import SubHeader from "../components/Navigation/SubHeader";

import DesktopStudyLayout from "../components/Study/DesktopStudyLayout";
import MobileStudyLayout from "../components/Study/MobileStudyLayout";
import MobileStudyTabs from "../components/Study/MobileStudyTabs";
import MobileStudyNav from "../components/Study/MobileStudyNav";

import useNotes from "../hooks/useNotes";
import useCommentary from "../hooks/useCommentary";
import useBookmarks from "../hooks/useBookmarks";
import useScripturePreviews from "../hooks/useScripturePreviews";
import useHighlights from "../hooks/useHighlights";
import useVerseSelection from "../hooks/useVerseSelection";

import GuestSavePrompt from "../components/Auth/GuestSavePrompt";

export default function StudyPage() {
    const {
        book: urlBook,
        chapter: urlChapter
    } = useParams();

    const [searchParams] = useSearchParams();
    const urlVerse = searchParams.get("verse");
    const urlTranslation = searchParams.get("translation");
    const urlCommentary = searchParams.get("commentary");

    // -------------------------
    // BIBLE STATE
    // -------------------------

    const [verses, setVerses] = useState([]);
    const [book, setBook] = useState(
        urlBook || "Genesis"
    );
    const [chapter, setChapter] = useState(
        Number(urlChapter) || 1
    );
    const [books, setBooks] = useState([]);
    const [selectedVerse, setSelectedVerse] = useState(
        urlVerse
            ? Number(urlVerse)
            : null
    );

    // -------------------------
    // LAYOUT STATE
    // -------------------------

    const [layout, setLayout] = useState("side");
    const [mobileTab, setMobileTab] = useState(
        "scripture"
    );
    const [rightPanelTab, setRightPanelTab] = useState(
        "commentary"
    );

    // -------------------------
    // TRANSLATION STATE
    // -------------------------

    const [translation, setTranslation] = useState(
        urlTranslation || ""
    );
    const [translations, setTranslations] = useState([]);

    // -------------------------
    // SHARED FEATURE STATE
    // -------------------------

    const notesState = useNotes({
        book,
        chapter,
        selectedVerse,
        books
    });
    const commentaryState = useCommentary({
        book,
        chapter,
        books,

        urlCommentary: urlCommentary
            ? Number(urlCommentary)
            : null
    });
    //bookmark state for desktop and mobile to share
    const bookmarksState = useBookmarks();
    // Own highlights here so desktop and mobile share the same data and actions.
    const highlightsState = useHighlights();
    // Share the exact selected verses across desktop and mobile readers.
    const verseSelection = useVerseSelection();
    // Read stable selection actions for the navigation effects.
    const { clearSelection, replaceSelection, retainAvailableVerses } = verseSelection;

    // React Router gives each history entry a navigation key.
    const location = useLocation();

    // Remember which navigation has already updated the selection.
    const appliedNavigationRef = useRef(null);

    const bookmarkPreviews = useScripturePreviews(
        bookmarksState.bookmarks,
        books,
        translation,
        highlightsState.highlights
    );

    // Clear temporary verse selections when the reading location changes.
    useEffect(() => {
        clearSelection();

        // Remove commentary emphasis belonging to the previous location.
        setSelectedVerse(null);
    }, [book, chapter, clearSelection]);

    // -------------------------
    // SYNC URL
    // -------------------------

    useEffect(() => {
        setBook(
            urlBook || "Genesis"
        );

        setChapter(
            Number(urlChapter) || 1
        );

        setSelectedVerse(
            urlVerse
                ? Number(urlVerse)
                : null
        );

        if (urlTranslation) {
            setTranslation(urlTranslation);
        }
    }, [urlBook, urlChapter, urlVerse, urlTranslation]);

    // Apply the URL's destination verse once the reading location is ready.
    useEffect(() => {
        // Do not reselect a verse after the user deliberately deselects it.
        if (appliedNavigationRef.current === location.key) {
            return;
        }

        const destinationBook = urlBook || "Genesis";
        const destinationChapter = Number(urlChapter) || 1;

        // Wait for the URL synchronization effect to update the displayed location.
        if (book !== destinationBook || chapter !== destinationChapter) {
            return;
        }

        const destinationRecord = books.find(
            (item) => item.name === destinationBook
        );

        // Wait until the book records have loaded.
        if (!destinationRecord) {
            return;
        }

        const destinationVerse = Number(urlVerse);
        const hasDestinationVerse =
            Number.isInteger(destinationVerse) && destinationVerse > 0;

        if (hasDestinationVerse) {
            // Replace old selections with the explicitly requested destination.
            replaceSelection(
                destinationRecord.id,
                destinationChapter,
                destinationVerse
            );

            // Keep commentary focused on the same verse.
            setSelectedVerse(destinationVerse);
        } else {
            // Navigation without a verse starts with no selection or emphasis.
            clearSelection();
            setSelectedVerse(null);
        }

        // Mark this navigation as handled, including Back/Forward visits.
        appliedNavigationRef.current = location.key;
    }, [
        location.key,
        urlBook,
        urlChapter,
        urlVerse,
        book,
        chapter,
        books,
        replaceSelection,
        clearSelection
    ]);

    // -------------------------
    // LOAD BIBLE CHAPTER
    // -------------------------

    // Load Scripture and reconcile selection with the returned translation.
    useEffect(() => {
        const currentBook = books.find((item) => item.name === book);

        // Wait until the translation and book ID are available.
        if (!translation || !currentBook) {
            return;
        }

        // Ignore this request if the reading location changes before it finishes.
        let ignore = false;

        async function loadChapter() {
            try {
                const data = await getBibleChapter(
                    book,
                    chapter,
                    translation
                );

                // Reject unexpected responses before using array operations.
                if (!Array.isArray(data)) {
                    throw new Error("Unable to load Scripture.");
                }

                if (ignore) {
                    return;
                }

                setVerses(data);

                // Preserve only selected coordinates available in this chapter.
                retainAvailableVerses(currentBook.id, chapter, data);

                // Remove commentary focus if that verse is unavailable.
                setSelectedVerse((current) =>
                    data.some((verse) => verse.verse_number === current)
                        ? current
                        : null
                );
            } catch (error) {
                if (!ignore) {
                    console.error(error);
                }
            }
        }

        loadChapter();

        return () => {
            // Older responses must not overwrite a newer chapter or translation.
            ignore = true;
        };
    }, [book, chapter, translation, books, retainAvailableVerses]);

    // -------------------------
    // LOAD BOOKS
    // -------------------------

    useEffect(() => {
        getBooks()
            .then((data) => {
                setBooks(data);
            })
            .catch((error) => {
                console.error(error);
            });
    }, []);

    // -------------------------
    // LOAD TRANSLATIONS
    // -------------------------

    useEffect(() => {
        getTranslations()
            .then((data) => {
                setTranslations(data);

                if (data.length > 0) {
                    setTranslation(
                        (currentTranslation) => {
                            const translationExists =
                                data.some(
                                    (item) =>
                                        item.abbreviation ===
                                        currentTranslation
                                );

                            return translationExists
                                ? currentTranslation
                                : data[2].abbreviation;
                        }
                    );
                }
            })
            .catch((error) => {
                console.error(error);
            });
    }, []);


    return (
        <>
            <Header
                layout={layout}
                setLayout={setLayout}
                translation={translation}
            />

            <SubHeader
                verses={verses}
                chapter={chapter}
                setChapter={setChapter}
                book={book}
                books={books}
                setBook={setBook}
                selectedVerse={selectedVerse}
                setSelectedVerse={setSelectedVerse}
            />

            <MobileStudyTabs
                activeTab={mobileTab}
                setActiveTab={setMobileTab}
            />

            <DesktopStudyLayout
                verseSelection={verseSelection}
                highlightsState={highlightsState}
                bookmarksState={bookmarksState}
                bookmarkPreviews={bookmarkPreviews}
                layout={layout}
                verses={verses}
                book={book}
                chapter={chapter}
                translation={translation}
                translations={translations}
                selectedVerse={selectedVerse}
                setSelectedVerse={setSelectedVerse}
                setTranslation={setTranslation}
                books={books}
                rightPanelTab={rightPanelTab}
                setRightPanelTab={setRightPanelTab}
                notesState={notesState}
                commentaryState={commentaryState}
            />

            <MobileStudyLayout
                verseSelection={verseSelection}
                highlightsState={highlightsState}
                bookmarksState={bookmarksState}
                bookmarkPreviews={bookmarkPreviews}
                mobileTab={mobileTab}
                setMobileTab={setMobileTab}
                verses={verses}
                book={book}
                chapter={chapter}
                translation={translation}
                translations={translations}
                selectedVerse={selectedVerse}
                setSelectedVerse={setSelectedVerse}
                setTranslation={setTranslation}
                books={books}
                notesState={notesState}
                commentaryState={commentaryState}
            />

            <MobileStudyNav
                activeTab={mobileTab}
                setActiveTab={setMobileTab}
            />
            
            {/* Show one prompt when either guest feature requests it. */}
            {(
                bookmarksState.showLoginPrompt ||
                highlightsState.showLoginPrompt
            ) && (
                <GuestSavePrompt
                    onClose={() => {
                        // Dismiss both requests without removing temporary study data.
                        bookmarksState.setShowLoginPrompt(false);
                        highlightsState.setShowLoginPrompt(false);
                    }}
                />
            )}
        </>
    );
}