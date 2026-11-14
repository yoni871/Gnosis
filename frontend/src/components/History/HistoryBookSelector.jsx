import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { eventSlug, getFirstPublishedEvent, listBooks } from "../../services/historyService";
import { historyPath } from "../../utils/seo";

const TESTAMENTS = [
    { id: "OT", label: "Old Testament" },
    { id: "NT", label: "New Testament" },
];

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
                        // A book with published events opens its first
                        // event directly — the book URL redirects there
                        // anyway. A book with none is not a link: it
                        // shows a Coming Soon chip here on the homepage,
                        // and its book URL redirects back to this
                        // directory. The chip carries tabIndex -1 (never
                        // a tab stop — it is not interactive) so the
                        // panel-close focus return can still land on it.
                        const firstEvent = book.hasEvents ? getFirstPublishedEvent(book.id) : null;
                        if (!firstEvent) {
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
                        return (
                            <li key={book.id}>
                                <Link
                                    to={historyPath(book.id, eventSlug(firstEvent.id))}
                                    className="history-book-chip"
                                    data-history-book={book.id}
                                >
                                    {book.title}
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
