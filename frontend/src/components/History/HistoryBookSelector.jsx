import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listBooks } from "../../services/historyService";
import { historyPath } from "../../utils/seo";

const TESTAMENTS = [
    { id: "OT", label: "Old Testament" },
    { id: "NT", label: "New Testament" },
];

// Published categories make a book available even before it has events.
// Show only nonzero counts so a category-only book remains easy to scan.
function formatBookCounts(book) {
    if (!book.hasCategories) return null;
    const categories = book.categoryCount === 1 ? "1 category" : `${book.categoryCount} categories`;
    if (!book.hasEvents) return categories;
    const events = book.eventCount === 1 ? "1 event" : `${book.eventCount} events`;
    return `${categories} · ${events}`;
}

export default function HistoryBookSelector({ books = listBooks(), open = false, onClose, initialTestament = "OT" }) {
    const [testament, setTestament] = useState(initialTestament);
    const tabs = useRef([]);
    const visibleBooks = books.filter((book) => book.testament === testament);

    const handleDrawerKeyDown = (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            onClose?.();
        }
    };

    const selectTab = (index) => {
        const next = TESTAMENTS[index];
        setTestament(next.id);
        tabs.current[index]?.focus();
    };

    const handleTabKeyDown = (event, index) => {
        let nextIndex;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % TESTAMENTS.length;
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + TESTAMENTS.length) % TESTAMENTS.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = TESTAMENTS.length - 1;
        if (nextIndex === undefined) return;
        event.preventDefault();
        selectTab(nextIndex);
    };

    if (!open) return null;

    return (
        <div
            id="history-book-drawer"
            className="history-book-drawer"
            onKeyDown={handleDrawerKeyDown}
        >
            <div className="history-testament-tabs" role="tablist" aria-label="Choose a testament">
                {TESTAMENTS.map((item, index) => {
                    const selected = testament === item.id;
                    return (
                        <button
                            key={item.id}
                            ref={(element) => { tabs.current[index] = element; }}
                            type="button"
                            role="tab"
                            id={`history-tab-${item.id.toLowerCase()}`}
                            aria-selected={selected}
                            aria-controls="history-book-tabpanel"
                            tabIndex={selected ? 0 : -1}
                            onClick={() => setTestament(item.id)}
                            onKeyDown={(event) => handleTabKeyDown(event, index)}
                        >
                            {item.label}
                            <span>{item.id === "OT" ? 39 : 27}</span>
                        </button>
                    );
                })}
            </div>
            <div
                id="history-book-tabpanel"
                role="tabpanel"
                aria-labelledby={`history-tab-${testament.toLowerCase()}`}
                tabIndex={0}
            >
                <ul className="history-book-chips">
                    {visibleBooks.map((book) => {
                        // Books with published entries link to their landing
                        // pages. Empty books retain a focusable, inert chip
                        // for focus return from the reader.
                        if (!book.hasEvents && !book.hasCategories) {
                            return (
                                <li key={book.id}>
                                    <span
                                        className="history-book-chip history-book-chip--upcoming"
                                        data-history-book={book.id}
                                        tabIndex={-1}
                                    >
                                        <span>{book.title}</span>
                                        <span className="history-book-chip-soon">Coming Soon</span>
                                    </span>
                                </li>
                            );
                        }
                        const counts = formatBookCounts(book);
                        return (
                            <li key={book.id}>
                                <Link
                                    to={historyPath(book.id)}
                                    className="history-book-chip"
                                    data-history-book={book.id}
                                >
                                    {counts ? `${book.title} · ${counts}` : book.title}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
                <p className="history-book-scroll-hint">Scroll for more books <span aria-hidden="true">↓</span></p>
            </div>
        </div>
    );
}
