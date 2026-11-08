import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

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

// ?verse= carries the selected verses as a comma list in click order
// ("1,3"); a single verse stays "1", so older links keep working.
// Anything that is not a positive integer is dropped.
function parseVerseParam(value) {
    if (!value) {
        return [];
    }

    return value
        .split(",")
        .map((part) => Number(part))
        .filter((number) => Number.isInteger(number) && number > 0);
}

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
    // True while a chapter is being fetched. The reader shows a loading
    // note instead of an empty pane while this is true and no verses
    // have arrived yet; once verses exist they stay visible while a
    // new chapter loads, so switching chapters never blanks the page.
    const [versesLoading, setVersesLoading] = useState(false);
    const [book, setBook] = useState(
        urlBook || "Genesis"
    );
    const [chapter, setChapter] = useState(
        Number(urlChapter) || 1
    );
    const [books, setBooks] = useState([]);
    const [selectedVerse, setSelectedVerse] = useState(() => {
        // The URL carries the whole selection (?verse=1,3); the focused
        // verse is the last one clicked.
        const initialVerses = parseVerseParam(urlVerse);
        return initialVerses.length > 0
            ? initialVerses[initialVerses.length - 1]
            : null;
    });

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

    // When the opening catalog (books + translations) cannot load,
    // the reader shows a friendly error with a retry instead of
    // rendering with broken data. Incrementing reloadKey re-runs
    // the load.
    const [loadError, setLoadError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);

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
    const { clearSelection, replaceSelectionSet, retainAvailableVerses } = verseSelection;

    const navigate = useNavigate();

    // Cross-passage navigation for Original Language occurrences: an
    // occurrence in the passage already open just refocuses its verse;
    // one in another book or chapter navigates the reader there, keeping
    // the current translation and commentary in the URL so the reader
    // lands in the same state it left. The URL's destination-verse
    // effect then restores the selection at the target verse.
    const navigateToPassage = useCallback((target) => {
        if (!target) return;
        if (target.book === book && target.chapter === chapter) {
            setSelectedVerse(target.verse);
            return;
        }
        const params = new URLSearchParams();
        params.set("translation", translation);
        if (commentaryState.selectedCommentator != null) {
            params.set("commentary", String(commentaryState.selectedCommentator));
        }
        params.set("verse", String(target.verse));
        navigate(`/bible/${target.book}/${target.chapter}?${params.toString()}`);
    }, [book, chapter, translation, commentaryState.selectedCommentator, navigate]);

    // React Router gives each history entry a navigation key.
    const location = useLocation();

    // Remember which navigation has already updated the selection.
    const appliedNavigationRef = useRef(null);

    // The verses selected in the chapter on screen, in click order.
    // The URL carries this whole list (?verse=1,3) so a refresh restores
    // the multi-verse selection, not just the focused verse.
    const selectedVersesInChapter = useMemo(() => {
        if (verseSelection.selection.bookId !== currentBook?.id) {
            return [];
        }

        return verseSelection.selection.verses
            .filter((point) => point.chapter === chapter)
            .map((point) => point.verse);
    }, [verseSelection.selection, currentBook, chapter]);

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

        // The URL carries the whole selection (?verse=1,3); the focused
        // verse is the last one clicked.
        const destinationVerses = parseVerseParam(urlVerse);
        setSelectedVerse(
            destinationVerses.length > 0
                ? destinationVerses[destinationVerses.length - 1]
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
        // The URL carries the whole selection (?verse=1,3), not just the
        // focused verse, so a refresh restores a multi-verse selection.
        // When nothing is selected, fall back to the focused verse:
        // the selection is per-account private state and resets on an
        // account switch while the focus (plain state) survives, and
        // wiping the verse here would drop the focus the reader and
        // the note composer still point at. A deliberate deselect
        // clears the focus too, so the verse still drops from the URL.
        // Until the apply effect below has restored the selection for
        // this location, keep whatever verse the URL already carries:
        // the selection is still empty on mount, and writing it now
        // would wipe the ?verse= the reader arrived with before it can
        // be restored.
        const desiredVerse =
            appliedNavigationRef.current === location.key
                ? (
                    selectedVersesInChapter.length > 0
                        ? selectedVersesInChapter.join(",")
                        : (selectedVerse != null ? String(selectedVerse) : null)
                )
                : searchParams.get("verse");

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
        location.key,
        selectedVerse,
        selectedVersesInChapter,
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

        const destinationVerses = parseVerseParam(urlVerse);

        if (destinationVerses.length > 0) {
            // Restore the whole selection the URL carries. Only replace
            // when it differs from the current selection: the URL is
            // rewritten by the reader itself on every click, and
            // re-applying it here used to collapse a multi-verse
            // selection down to the last verse clicked.
            const matchesCurrentSelection =
                destinationVerses.length === selectedVersesInChapter.length &&
                destinationVerses.every(
                    (verse, index) => verse === selectedVersesInChapter[index]
                );

            if (!matchesCurrentSelection) {
                replaceSelectionSet(
                    destinationRecord.id,
                    destinationChapter,
                    destinationVerses
                );
            }

            // Keep commentary focused on the last verse selected.
            setSelectedVerse(
                destinationVerses[destinationVerses.length - 1]
            );
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
        replaceSelectionSet,
        clearSelection,
        selectedVersesInChapter
    ]);

    // -------------------------
    // LOAD BIBLE CHAPTER
    // -------------------------

    // Load Scripture and reconcile selection with the returned translation.
    useEffect(() => {
        const currentBook = books.find((item) => item.name === book);

        // Wait until the translation and book ID are available.
        // Loading is only ever set while a fetch is actually running,
        // and that fetch always clears it when it settles (or a newer
        // fetch takes over), so nothing here needs to reset it.
        if (!translation || !currentBook) {
            return;
        }

        // Ignore this request if the reading location changes before it finishes.
        let ignore = false;

        async function loadChapter() {
            setVersesLoading(true);
            // A licensed-translation fallback re-fetches as BSB; keep
            // the loading note up across that continuation instead of
            // flashing an empty pane between the two fetches.
            let fallingBack = false;
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
                        fallingBack = true;
                        setLicensedFallback({ from: translation });
                        setTranslation("BSB");
                    } else {
                        console.error(error);
                    }
                }
            } finally {
                if (!ignore && !fallingBack) {
                    setVersesLoading(false);
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
    // LOAD BOOKS + TRANSLATIONS
    // -------------------------

    // Load the opening catalog together: the reader needs both the
    // book list and the translation list before it can show anything
    // useful. Either request failing shows the error state below
    // instead of the reader — the services reject on a failed
    // request or an unexpected payload, so an error object can never
    // land in state where the page expects arrays.
    useEffect(() => {
        let ignore = false;

        async function loadCatalog() {
            try {
                const [bookList, translationList] = await Promise.all([
                    getBooks(),
                    getTranslations()
                ]);

                if (ignore) {
                    return;
                }

                setBooks(bookList);
                setTranslations(translationList);
                setLoadError(null);

                if (translationList.length > 0) {
                    setTranslation(
                        (currentTranslation) => {
                            const translationExists =
                                translationList.some(
                                    (item) =>
                                        item.abbreviation ===
                                        currentTranslation
                                );

                            // Keep the previous default (the third
                            // listed translation) when the current one
                            // is unavailable, falling back to the first
                            // listed translation for short lists.
                            return translationExists
                                ? currentTranslation
                                : (translationList[2] ?? translationList[0]).abbreviation;
                        }
                    );
                }
            } catch (error) {
                if (!ignore) {
                    console.error(error);
                    setLoadError(
                        "We couldn’t load the Bible text."
                    );
                }
            }
        }

        loadCatalog();

        return () => {
            ignore = true;
        };
    }, [reloadKey]);


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

            {loadError ? (
                <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
                    <h1 className="text-xl font-semibold text-[var(--text-primary)]">
                        {loadError}
                    </h1>
                    <p className="max-w-md text-[var(--text-muted)]">
                        The study service is unavailable right now.
                        Check your connection and try again.
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            setLoadError(null);
                            setReloadKey((key) => key + 1);
                        }}
                        className="mt-2 rounded-md border border-[var(--color-brand)] px-4 py-2 text-[var(--color-brand)]"
                    >
                        Try again
                    </button>
                </main>
            ) : (
            <>
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
                versesLoading={versesLoading}
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
                navigateToPassage={navigateToPassage}
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
                navigateToPassage={navigateToPassage}
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
            )}
        </>
    );
}