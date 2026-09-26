import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import {
    getBooks,
    getBibleChapter,
    getTranslations
} from "../services/bibleService";

import Header from "../components/Header/Header";
import SubHeader from "../components/Navigation/SubHeader";

import DesktopStudyLayout from "../components/Study/DesktopStudyLayout";
import MobileStudyLayout from "../components/Study/MobileStudyLayout";
import MobileStudyTabs from "../components/Study/MobileStudyTabs";
import MobileStudyNav from "../components/Study/MobileStudyNav";


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

    }, [
        urlBook,
        urlChapter,
        urlVerse,
        urlTranslation
    ]);


    // -------------------------
    // LOAD BIBLE CHAPTER
    // -------------------------

    useEffect(() => {

        if (!translation) {
            return;
        }

        getBibleChapter(
            book,
            chapter,
            translation
        )
            .then((data) => {
                setVerses(data);
            })
            .catch((error) => {
                console.error(error);
            });

    }, [
        book,
        chapter,
        translation
    ]);


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


            {/* MOBILE TOP TABS */}

            <MobileStudyTabs
                activeTab={mobileTab}
                setActiveTab={setMobileTab}
            />


            {/* DESKTOP */}

            <DesktopStudyLayout
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

                urlCommentary={urlCommentary}
            />


            {/* MOBILE */}

            <MobileStudyLayout
                mobileTab={mobileTab}

                verses={verses}

                book={book}
                chapter={chapter}

                translation={translation}
                translations={translations}

                selectedVerse={selectedVerse}
                setSelectedVerse={setSelectedVerse}

                setTranslation={setTranslation}

                books={books}

                urlCommentary={urlCommentary}
            />


            {/* MOBILE BOTTOM NAV */}

            <MobileStudyNav
                activeTab={mobileTab}
                setActiveTab={setMobileTab}
            />

        </>
    );
}