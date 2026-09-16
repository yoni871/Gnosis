import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { searchBible } from "../services/searchService";
import { getBooks } from "../services/bibleService";
import Header from "../components/Header/Header";
import SubHeader from "../components/Navigation/SubHeader";

export default function SearchResultsPage() {
    const [searchParams] = useSearchParams();
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedBook, setSelectedBook] = useState("");
    const [selectedChapter, setSelectedChapter] = useState("");
    const [books, setBooks] = useState([]);

    const navigate = useNavigate();
    const query = searchParams.get("q");

    const filteredResults = searchResults.filter((result) => {
        // if a book is selected show the results from that book only
        if (selectedBook && result.book !== selectedBook) {
            return false;
        }

        // if chapter is selected only show results from that chapter
        if (
            selectedChapter &&
            result.chapter_number !== Number(selectedChapter)
        ) {
            return false;
        }

        return true;
    });

    useEffect(() => {
        getBooks()
            .then(data => {
                setBooks(data);
            })
            .catch(error => {
                console.error(error);
            });
    }, []);

    useEffect(() => {
        if (!query) {
            return;
        }

        setLoading(true);

        searchBible(query)
            .then(data => {
                setSearchResults(data);
                setLoading(false);
            })
            .catch(error => {
                setLoading(false);
                console.error(error);
            });
    }, [query]);

    return (
        <div className="
            min-h-screen
            bg-[var(--bg-page)]
            pt-[100px]
        ">
            <Header variant="searchResults" />

            <SubHeader
                variant="searchResults"
                selectedBook={selectedBook}
                setSelectedBook={setSelectedBook}
                books={books}
                selectedChapter={selectedChapter}
                setSelectedChapter={setSelectedChapter}
                searchResults={searchResults}
            />

            {loading && (
                <p className="text-[var(--text-primary)]">
                    Loading...
                </p>
            )}

            {!loading && filteredResults.length === 0 && query && (
                <>
                    <h2 className="text-[var(--text-primary)]">
                        No verses found for {query}
                    </h2>
                    <p className="text-[var(--text-muted)]">
                        Try a different word or phrase
                    </p>
                </>
            )}

            <div className="
                mx-auto
                max-w-5xl
                px-4
                py-3
                text-[10px]
                text-[var(--text-muted)]
                sm:px-6
                sm:py-4
                sm:text-[11px]
                md:text-[12px]
            ">
                {filteredResults.length} verses found
            </div>

            {filteredResults.map((result, index) => (
                <button
                    className="
                        mx-auto
                        mb-3
                        block
                        group
                        w-[calc(100%-32px)]
                        sm:w-[50%]
                        max-w-5xl
                        rounded-xl
                        border
                        border-[var(--border-control)]
                        bg-[var(--bg-panel)]
                        p-4
                        sm:p-7
                        text-left
                        shadow-sm
                        transition-all
                        duration-300
                        hover:-translate-y-[1px]
                        hover:bg-[var(--bg-control-hover)]
                        hover:shadow-md
                    "
                    key={index}
                    onClick={() => {
                        navigate(
                            `/bible/${result.book}/${result.chapter_number}?verse=${result.verse_number}`
                        );
                    }}
                >
                    <div className="
                        flex
                        items-center
                        justify-between
                        pb-3
                        mb-3
                        border-b
                        border-[var(--border-control)]
                    ">
                        <strong className="
                            font-serif
                            text-[12px]
                            sm:text-[13px]
                            font-bold
                            tracking-[0.2px]
                            text-[var(--color-brand)]
                        ">
                            {result.book} {result.chapter_number}:{result.verse_number}
                        </strong>

                        <span className="
                            shrink-0
                            text-[10px]
                            font-medium
                            text-[var(--text-muted)]
                            transition-colors
                            group-hover:text-[var(--color-brand)]
                        ">
                            Commentary →
                        </span>
                    </div>

                    <p className="
                        mt-3
                        mb-0
                        font-serif
                        text-[13px]
                        sm:text-[14px]
                        leading-7
                        tracking-[0.1px]
                        text-[var(--text-primary)]
                    ">
                        {result.text}
                    </p>
                </button>
            ))}
        </div>
    );
}