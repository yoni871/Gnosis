import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listBooks } from "../../services/historyService";
import { historyPath } from "../../utils/seo";

const TESTAMENTS = [
    { id: "OT", label: "Old Testament" },
    { id: "NT", label: "New Testament" },
];

export default function HistoryBookSelector({ books = listBooks() }) {
    const [testament, setTestament] = useState("OT");
    const tabs = useRef([]);
    const visibleBooks = books.filter((book) => book.testament === testament);

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

    return (
        <div className="history-book-selector">
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
                    {visibleBooks.map((book) => (
                        <li key={book.id}>
                            <Link to={historyPath(book.id)} data-history-book={book.id}>
                                <span>{book.title}</span>
                                <small>{book.hasEvents ? `${book.eventCount} ${book.eventCount === 1 ? "event" : "events"}` : "Upcoming"}</small>
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
