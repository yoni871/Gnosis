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
import useReadingState from "../hooks/useReadingState";
import useScripturePreviews from "../hooks/useScripturePreviews";
import useHighlights from "../hooks/useHighlights";
import useVerseSelection from "../hooks/useVerseSelection";

import GuestSavePrompt from "../components/Auth/GuestSavePrompt";

import Seo from "../components/Seo";
import {
    chapterDescription,
    chapterTitle,
    chapterUrl,
} from "../utils/seo";

export default function StudyPage() {
    const {
        book: urlBook,
        chapter: urlChapter
    } = useParams();

    const [searchParams, setSearchParams] = useSearchParams();
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

    // When a licensed translation is temporarily unavailable (quota,
    // provider outage), the reader falls back to BSB and says so once,
    // instead of showing an empty page. Dismissed with the X, or by
    // picking another translation.
    const [licensedFallback, setLicensedFallback] = useState(null);

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
    // Save the reading position for logged-in readers, so the landing
    // page can offer it back as "Continue reading".
    const currentBook = books.find((item) => item.name === book);
    useReadingState({
        bookId: currentBook?.id ?? null,
        chapter,
        translation,
        commentaryId: commentaryState.selectedCommentator,
        verse: selectedVerse,
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

    // Keep the URL in step with the reader, so a refresh restores the
    // exact spot instead of the defaults. The reader already reads its
    // position from the URL, but nothing wrote it back: the translation,
    // commentary, and focused verse lived in state only, so a refresh
    // dropped the translation (back to KJV), the commentary (back to
    // Matthew Henry), and the focused verse. Replace, don't push: moving
    // within a chapter is not a new history entry, so Back still leaves
    // the reader instead of stepping through translations.
    useEffect(() => {
        // Wait until a translation is chosen. On mount the translations
        // have not loaded yet, and writing a query without one here would
        // wipe the ?translation= the reader arrived with.
        if (!translation) {
            return;
        }

        const desiredTranslation = translation;
        const desiredCommentary =
            commentaryState.selectedCommentator != null
                ? String(commentaryState.selectedCommentator)
                : null;
        const desiredVerse =
            selectedVerse != null ? String(selectedVerse) : null;

        // Skip the write when the URL already says where the reader is,
        // so the read effect above and this one never chase each other.
        if (
            searchParams.get("translation") === desiredTranslation &&
            searchParams.get("commentary") === desiredCommentary &&
            searchParams.get("verse") === desiredVerse
        ) {
            return;
        }

        const params = new URLSearchParams();
        params.set("translation", desiredTranslation);
        if (desiredCommentary !== null) {
            params.set("commentary", desiredCommentary);
        }
        if (desiredVerse !== null) {
            params.set("verse", desiredVerse);
        }
        setSearchParams(params, { replace: true });
    }, [
        book,
        chapter,
        selectedVerse,
        translation,
        commentaryState.selectedCommentator,
        searchParams,
        setSearchParams,
    ]);

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
                    // A licensed translation that cannot be served right
                    // now falls back to BSB, once, with a note — never an
                    // empty page, and never BSB text mislabelled as the
                    // requested translation.
                    if (
                        error.code === "LICENSED_UNAVAILABLE" &&
                        translation !== "BSB"
                    ) {
                        setLicensedFallback({ from: translation });
                        setTranslation("BSB");
                    } else {
                        console.error(error);
                    }
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
            {/* Canonical URL is the clean chapter address: reader state
                in ?verse=, ?translation=, and ?commentary= is never part
                of it, so parameter variants cannot become duplicate
                indexed pages. */}
            <Seo
                title={chapterTitle(book, chapter)}
                description={chapterDescription(book, chapter)}
                canonical={chapterUrl(book, chapter)}
                ogType="article"
            />

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

            {licensedFallback && (
                <div className="mx-auto max-w-[700px] px-4 pt-3 text-center text-[13px] text-[var(--text-muted)]">
                    {licensedFallback.from} is temporarily unavailable — showing the Berean Standard Bible instead.
                    <button
                        type="button"
                        aria-label="Dismiss"
                        onClick={() => setLicensedFallback(null)}
                        className="ml-2 cursor-pointer underline"
                    >
                        Dismiss
                    </button>
                </div>
            )}

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