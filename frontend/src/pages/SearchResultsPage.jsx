import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { searchBible, searchCommentary } from "../services/searchService";
import { getBooks } from "../services/bibleService";
import Header from "../components/Header/Header";
import SubHeader from "../components/Navigation/SubHeader";

// Formats a commentary result as a readable Bible passage.
function formatPassage(result) {
    const start =
        `${result.book} ${result.start_chapter}:${result.start_verse}`;

    const isSingleVerse =
        result.start_chapter === result.end_chapter &&
        result.start_verse === result.end_verse;

    if (isSingleVerse) {
        return start;
    }

    if (result.start_chapter === result.end_chapter) {
        return `${start}-${result.end_verse}`;
    }

    return `${start}-${result.end_chapter}:${result.end_verse}`;
}


export default function SearchResultsPage() {
    const [searchParams] = useSearchParams();
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedBook, setSelectedBook] = useState("");
    const [selectedChapter, setSelectedChapter] = useState("");
    const [books, setBooks] = useState([]);
    // Stores matching commentary entries.
    const [commentaryResults, setCommentaryResults] = useState([]);

    const navigate = useNavigate();
    const query = searchParams.get("q");
    const translation = searchParams.get("translation") || "BSB";

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

    const filteredCommentaryResults = commentaryResults.filter((result) => {
        // Show only commentary from the selected book.
        if (selectedBook && result.book !== selectedBook) {
            return false;
        }

        // Keep entries whose passage range includes the selected chapter.
        if (selectedChapter) {
            const chapterNumber = Number(selectedChapter);

            if (
                chapterNumber < result.start_chapter ||
                chapterNumber > result.end_chapter
            ) {
                return false;
            }
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

        // Fetch Scripture and commentary results at the same time.
        Promise.all([
            searchBible(query, translation),
            searchCommentary(query)
        ])
            .then(([bibleData, commentaryData]) => {
                setSearchResults(bibleData);
                setCommentaryResults(commentaryData);
            })
            .catch((error) => {
                console.error(error);
                setSearchResults([]);
                setCommentaryResults([]);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [query, translation]);

    return (
        <div className="
            min-h-screen
            bg-[var(--bg-page)]
            pt-[100px]
        ">
            <Header variant="searchResults" translation={translation}/>

            <SubHeader
                variant="searchResults"
                selectedBook={selectedBook}
                setSelectedBook={setSelectedBook}
                books={books}
                selectedChapter={selectedChapter}
                setSelectedChapter={setSelectedChapter}
                searchResults={searchResults}
                translation={translation}
            />

            {loading && (
                <p className="text-[var(--text-primary)]">
                    Loading...
                </p>
            )}

            {!loading && 
                filteredResults.length === 0 && 
                filteredCommentaryResults.length === 0 &&
                query && (
                <>
                    <h2 className="text-[var(--text-primary)]">
                        No results found for “{query}”
                    </h2>
                    <p className="text-[var(--text-muted)]">
                        Try a different word or phrase
                    </p>
                </>
            )}

            <div className="
                mx-auto
                grid
                w-full
                max-w-[1700px]
                grid-cols-1
                gap-6
                px-[clamp(16px,3vw,48px)]
                py-5
                lg:h-[calc(100vh-100px)]
                lg:grid-cols-2
                lg:overflow-hidden
            ">
                {/* Scripture results */}
                <section className="
                    flex
                    min-h-0
                    flex-col
                    rounded-xl
                    border
                    border-transparent
                    border-t-[4px]
                    border-t-[var(--color-brand)]
                    bg-transparent
                    shadow-[0_8px_24px_rgba(80,55,35,0.08)]
                    lg:overflow-hidden
                    "
                >
                    <div className="
                        flex
                        shrink-0
                        items-center
                        justify-between
                        border-b
                        border-[var(--border-control)]
                        bg-[var(--bg-nav)]
                        px-4
                        py-3
                        text-[11px]
                        text-[var(--text-muted)]
                    ">
                        <h2 className="
                            font-serif
                            text-[18px]
                            font-semibold
                            text-[var(--text-primary)]
                        ">
                            Scripture
                        </h2>

                        <span className="
                            rounded-full
                            bg-[var(--bg-control-hover)]
                            px-2.5
                            py-1
                            font-semibold
                            text-[var(--color-brand)]
                        ">
                            {filteredResults.length} verses
                        </span>
                    </div>

                    <div className="
                        min-h-0
                        flex-1
                        space-y-3
                        lg:overflow-y-auto
                        p-3
                    ">
                        {filteredResults.map((result) => (
                            <button
                                key={`${result.book}-${result.chapter_number}-${result.verse_number}`}
                                className="
                                    group
                                    block
                                    w-full
                                    rounded-xl
                                    border
                                    border-[var(--border-control)]
                                    bg-[var(--bg-panel)]
                                    p-4
                                    text-left
                                    shadow-sm
                                    transition-all
                                    duration-300
                                    hover:-translate-y-[1px]
                                    hover:bg-[var(--bg-control-hover)]
                                    hover:shadow-md
                                "
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
                                    gap-3
                                ">
                                    <strong className="
                                        font-serif
                                        text-[13px]
                                        text-[var(--color-brand)]
                                    ">
                                        {result.book} {result.chapter_number}:{result.verse_number}
                                    </strong>

                                    <span className="
                                        rounded-full
                                        border
                                        border-[var(--border-control)]
                                        bg-[var(--bg-control-hover)]
                                        px-2
                                        py-1
                                        text-[9px]
                                        font-bold
                                        tracking-wide
                                        text-[var(--color-brand)]
                                    ">
                                        {result.translation}
                                    </span>
                                </div>

                                <p className="
                                    mt-3
                                    mb-0
                                    font-serif
                                    text-[14px]
                                    leading-7
                                    text-[var(--text-primary)]
                                ">
                                    {result.text}
                                </p>
                                <div className="
                                    mt-4
                                    flex
                                    items-center
                                    justify-between
                                    border-t
                                    border-[var(--border-control)]
                                    pt-3
                                    text-[10px]
                                    text-[var(--text-muted)]
                                ">
                                    <span>
                                        {result.book} · Chapter {result.chapter_number}
                                    </span>

                                    <span className="
                                        font-medium
                                        transition-colors
                                        group-hover:text-[var(--color-brand)]
                                    ">
                                        Read with commentary →
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>

                {/* Commentary results */}
                <section className="
                    flex
                    min-h-0
                    flex-col
                    rounded-xl
                    border
                    border-transparent
                    border-t-[4px]
                    border-t-[var(--color-brand)]
                    bg-transparent
                    shadow-[0_8px_24px_rgba(80,55,35,0.08)]
                    lg:overflow-hidden
                    "
                >
                    <div className="
                        flex
                        shrink-0
                        items-center
                        justify-between
                        border-b
                        border-[var(--border-control)]
                        bg-[var(--bg-nav)]
                        px-4
                        py-3
                        text-[11px]
                        text-[var(--text-muted)]
                    ">
                        <h2 className="
                            font-serif
                            text-[18px]
                            font-semibold
                            text-[var(--text-primary)]
                        ">
                            Commentary
                        </h2>

                        <span className="
                            rounded-full
                            bg-[var(--bg-control-hover)]
                            px-2.5
                            py-1
                            font-semibold
                            text-[var(--color-brand)]
                        ">
                            {filteredCommentaryResults.length} entries
                        </span>
                    </div>

                    <div className="
                        min-h-0
                        flex-1
                        space-y-3
                        lg:overflow-y-auto
                        p-3               
                    ">
                        {filteredCommentaryResults.map((result) => (
                            <button
                                key={result.id}
                                className="
                                    group
                                    block
                                    w-full
                                    rounded-xl
                                    border
                                    border-[var(--border-control)]
                                    bg-[var(--bg-panel)]
                                    p-4
                                    text-left
                                    shadow-sm
                                    transition-all
                                    duration-300
                                    hover:-translate-y-[1px]
                                    hover:bg-[var(--bg-control-hover)]
                                    hover:shadow-md
                                "
                                onClick={() => {
                                    navigate(
                                        `/bible/${result.book}/${result.start_chapter}` +
                                        `?verse=${result.start_verse}` +
                                        `&commentary=${result.commentary_id}`
                                    );
                                }}
                            >
                                <div className="
                                    flex
                                    items-start
                                    justify-between
                                    gap-3
                                ">
                                    <strong className="
                                        font-serif
                                        text-[13px]
                                        text-[var(--color-brand)]
                                    ">
                                        {formatPassage(result)}
                                    </strong>

                                    <span className="
                                        text-right
                                        text-[10px]
                                        text-[var(--text-muted)]
                                    ">
                                        {result.source}
                                    </span>
                                </div>

                                <h3 className="
                                    mt-3
                                    font-serif
                                    text-[14px]
                                    font-semibold
                                    text-[var(--text-primary)]
                                ">
                                    {result.entry_title}
                                </h3>

                                <p className="
                                    mt-2
                                    mb-0
                                    font-serif
                                    text-[13px]
                                    leading-6
                                    text-[var(--text-muted)]
                                ">
                                    {result.excerpt.replace(/<\/?b>/g, "")}
                                </p>
                            </button>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}