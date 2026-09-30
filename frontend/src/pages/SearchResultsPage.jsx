import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

import { searchBible, searchCommentary } from "../services/searchService";
import { getBooks } from "../services/bibleService";

import Header from "../components/Header/Header";
import SubHeader from "../components/Navigation/SubHeader";


function formatPassage(result) {
    const start =
        `${result.book} ${result.start_chapter}:${result.start_verse}`;

    if (
        result.start_chapter === result.end_chapter &&
        result.start_verse === result.end_verse
    ) {
        return start;
    }

    if (result.start_chapter === result.end_chapter) {
        return `${start}-${result.end_verse}`;
    }

    return `${start}-${result.end_chapter}:${result.end_verse}`;
}


const cardStyle = `
    group block w-full rounded-xl
    border border-[var(--border-control)]
    bg-[var(--bg-panel)] p-4 text-left shadow-sm
    transition duration-200
    hover:bg-[var(--bg-control-hover)] hover:shadow-md
    focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]
`;


function ResultsPanel({ id, title, count, unit, active, children }) {
    return (
        <section
            id={id}
            aria-label={`${title} results`}
            className={`
                ${active ? "flex" : "hidden"}
                min-h-0 flex-col overflow-hidden rounded-xl
                border border-transparent border-t-[4px]
                border-t-[var(--color-brand)] bg-transparent
                shadow-[0_8px_24px_rgba(80,55,35,0.08)]
                min-[769px]:flex
            `}
        >
            <div className="
                flex shrink-0 items-center justify-between gap-3
                border-b border-[var(--border-control)]
                bg-[var(--bg-nav)] px-4 py-3
            ">
                <h2 className="
                    font-serif text-[18px] font-semibold
                    text-[var(--text-primary)]
                ">
                    {title}
                </h2>

                <span className="
                    rounded-full bg-[var(--bg-control-hover)]
                    px-2.5 py-1 text-[11px] font-semibold
                    text-[var(--color-brand)]
                ">
                    {count} {unit}
                </span>
            </div>

            <div className="
                min-h-0 flex-1 space-y-3 overflow-y-auto
                overscroll-contain p-3
            ">
                {children}
            </div>
        </section>
    );
}


function EmptyResults({ title, children }) {
    return (
        <div className="
            flex min-h-[220px] flex-col items-center
            justify-center px-6 text-center
        ">
            <p className="
                font-serif text-[16px] font-semibold
                text-[var(--text-primary)]
            ">
                {title}
            </p>

            <p className="
                mt-2 max-w-xs text-[12px] leading-5
                text-[var(--text-muted)]
            ">
                {children}
            </p>
        </div>
    );
}


export default function SearchResultsPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const query = searchParams.get("q") || "";
    const translation = searchParams.get("translation") || "BSB";

    const [searchResults, setSearchResults] = useState([]);
    const [commentaryResults, setCommentaryResults] = useState([]);
    const [books, setBooks] = useState([]);

    const [loading, setLoading] = useState(false);
    const [searchError, setSearchError] = useState("");

    const [selectedBook, setSelectedBook] = useState("");
    const [selectedChapter, setSelectedChapter] = useState("");
    const [activeTab, setActiveTab] = useState("scripture");


    const filteredResults = searchResults.filter((result) => {
        if (selectedBook && result.book !== selectedBook) {
            return false;
        }

        return (
            !selectedChapter ||
            result.chapter_number === Number(selectedChapter)
        );
    });

    const filteredCommentaryResults = commentaryResults.filter((result) => {
        if (selectedBook && result.book !== selectedBook) {
            return false;
        }

        if (selectedChapter) {
            const chapter = Number(selectedChapter);

            return (
                chapter >= result.start_chapter &&
                chapter <= result.end_chapter
            );
        }

        return true;
    });


    useEffect(() => {
        let ignore = false;

        getBooks()
            .then((data) => {
                if (!ignore) {
                    setBooks(data);
                }
            })
            .catch(console.error);

        return () => {
            ignore = true;
        };
    }, []);


    useEffect(() => {
        let ignore = false;

        setSearchResults([]);
        setCommentaryResults([]);
        setSearchError("");
        setSelectedBook("");
        setSelectedChapter("");

        if (!query.trim()) {
            setLoading(false);
            return;
        }

        setLoading(true);

        Promise.all([
            searchBible(query, translation),
            searchCommentary(query)
        ])
            .then(([bibleData, commentaryData]) => {
                if (!ignore) {
                    setSearchResults(bibleData);
                    setCommentaryResults(commentaryData);
                }
            })
            .catch((error) => {
                if (!ignore) {
                    console.error(error);
                    setSearchError(
                        "We couldn't complete your search. Please try again."
                    );
                }
            })
            .finally(() => {
                if (!ignore) {
                    setLoading(false);
                }
            });

        return () => {
            ignore = true;
        };
    }, [query, translation]);


    return (
        <div className="
            flex h-dvh flex-col overflow-hidden
            bg-[var(--bg-page)]
            pt-[198px] min-[769px]:pt-[108px]
        ">
            <Header variant="searchResults" translation={translation} />

            <SubHeader
                variant="searchResults"
                selectedBook={selectedBook}
                setSelectedBook={setSelectedBook}
                books={books}
                selectedChapter={selectedChapter}
                setSelectedChapter={setSelectedChapter}
                searchResults={searchResults}
                commentaryResults={commentaryResults}
                translation={translation}
            />

            {/* Mobile result tabs */}
            <div className="
                fixed left-0 right-0 top-[154px] z-30
                grid h-[44px] grid-cols-2
                border-b border-[var(--border)]
                bg-[var(--bg-nav)] min-[769px]:hidden
            ">
                {[
                    {
                        id: "scripture",
                        label: "Scripture",
                        count: filteredResults.length
                    },
                    {
                        id: "commentary",
                        label: "Commentary",
                        count: filteredCommentaryResults.length
                    }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        aria-pressed={activeTab === tab.id}
                        aria-controls={`${tab.id}-results`}
                        onClick={() => setActiveTab(tab.id)}
                        className={`
                            flex items-center justify-center gap-2
                            border-b-2 font-serif text-[12px] font-semibold
                            transition-colors
                            ${
                                activeTab === tab.id
                                    ? "border-[var(--color-brand)] text-[var(--color-brand)]"
                                    : "border-transparent text-[var(--text-muted)]"
                            }
                        `}
                    >
                        {tab.label}

                        {!loading && !searchError && (
                            <span className="
                                rounded-full bg-[var(--bg-control-hover)]
                                px-2 py-0.5 text-[10px]
                            ">
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {loading ? (
                <div
                    role="status"
                    aria-live="polite"
                    className="
                        flex flex-1 items-center justify-center
                        gap-3 px-5 text-[13px] text-[var(--text-muted)]
                    "
                >
                    <span className="
                        h-4 w-4 shrink-0 animate-spin rounded-full
                        border-2 border-[var(--border-control)]
                        border-t-[var(--color-brand)]
                    " />

                    <span>Searching for “{query}”…</span>
                </div>
            ) : searchError ? (
                <div
                    role="alert"
                    className="flex flex-1 items-center justify-center px-5"
                >
                    <EmptyResults title="Search unavailable">
                        {searchError}
                    </EmptyResults>
                </div>
            ) : (
                <main className="
                    mx-auto grid w-full max-w-[1700px]
                    min-h-0 flex-1 grid-cols-1 gap-6
                    px-3 py-3
                    min-[769px]:grid-cols-2
                    min-[769px]:px-[clamp(16px,3vw,48px)]
                    min-[769px]:py-5
                ">
                    <ResultsPanel
                        id="scripture-results"
                        title="Scripture"
                        count={filteredResults.length}
                        unit="verses"
                        active={activeTab === "scripture"}
                    >
                        {filteredResults.length === 0 && (
                            <EmptyResults title="No Scripture results">
                                {query
                                    ? `No verses in ${translation} match “${query}” with these filters. Try another word or clear the filters.`
                                    : "Enter a word or phrase to begin searching."
                                }
                            </EmptyResults>
                        )}

                        {filteredResults.map((result) => (
                            <button
                                type="button"
                                key={`${result.book}-${result.chapter_number}-${result.verse_number}`}
                                className={cardStyle}
                                onClick={() => navigate(
                                    `/bible/${encodeURIComponent(result.book)}/${result.chapter_number}` +
                                    `?verse=${result.verse_number}` +
                                    `&translation=${encodeURIComponent(translation)}`
                                )}
                            >
                                <div className="
                                    flex items-center justify-between gap-3
                                ">
                                    <strong className="
                                        font-serif text-[13px]
                                        text-[var(--color-brand)]
                                    ">
                                        {result.book} {result.chapter_number}:{result.verse_number}
                                    </strong>

                                    <span className="
                                        shrink-0 rounded-full border
                                        border-[var(--border-control)]
                                        bg-[var(--bg-control-hover)]
                                        px-2 py-1 text-[9px] font-bold
                                        text-[var(--color-brand)]
                                    ">
                                        {result.translation || translation}
                                    </span>
                                </div>

                                <p className="
                                    mb-0 mt-3 font-serif text-[14px]
                                    leading-7 text-[var(--text-primary)]
                                ">
                                    {result.text}
                                </p>

                                <div className="
                                    mt-4 flex flex-wrap items-center
                                    justify-between gap-2
                                    border-t border-[var(--border-control)]
                                    pt-3 text-[10px] text-[var(--text-muted)]
                                ">
                                    <span>
                                        {result.book} · Chapter {result.chapter_number}
                                    </span>

                                    <span className="
                                        font-medium
                                        group-hover:text-[var(--color-brand)]
                                    ">
                                        Read with commentary →
                                    </span>
                                </div>
                            </button>
                        ))}
                    </ResultsPanel>

                    <ResultsPanel
                        id="commentary-results"
                        title="Commentary"
                        count={filteredCommentaryResults.length}
                        unit="entries"
                        active={activeTab === "commentary"}
                    >
                        {filteredCommentaryResults.length === 0 && (
                            <EmptyResults title="No commentary results">
                                {query
                                    ? `No commentary matches “${query}” with these filters. Try another word or clear the filters.`
                                    : "Enter a word or phrase to begin searching."
                                }
                            </EmptyResults>
                        )}

                        {filteredCommentaryResults.map((result) => (
                            <button
                                type="button"
                                key={result.id}
                                className={cardStyle}
                                onClick={() => navigate(
                                    `/bible/${encodeURIComponent(result.book)}/${result.start_chapter}` +
                                    `?verse=${result.start_verse}` +
                                    `&commentary=${result.commentary_id}` +
                                    `&translation=${encodeURIComponent(translation)}`
                                )}
                            >
                                <div className="
                                    flex flex-wrap items-start
                                    justify-between gap-2
                                ">
                                    <strong className="
                                        font-serif text-[13px]
                                        text-[var(--color-brand)]
                                    ">
                                        {formatPassage(result)}
                                    </strong>

                                    <span className="
                                        text-[10px] text-[var(--text-muted)]
                                    ">
                                        {result.source}
                                    </span>
                                </div>

                                <h3 className="
                                    mt-3 font-serif text-[14px]
                                    font-semibold text-[var(--text-primary)]
                                ">
                                    {result.entry_title}
                                </h3>

                                <p className="
                                    mb-0 mt-2 font-serif text-[13px]
                                    leading-6 text-[var(--text-muted)]
                                ">
                                    {(result.excerpt || "").replace(/<\/?b>/g, "")}...
                                </p>
                            </button>
                        ))}
                    </ResultsPanel>
                </main>
            )}
        </div>
    );
}