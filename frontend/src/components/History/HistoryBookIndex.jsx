// The 66-book index. Testament grouping, per-book event counts, and a
// generic "Upcoming" state for books without published events — book
// names are public Scripture data; unpublished event titles are content
// and never ship, so no title appears here.
import { Link } from "react-router-dom";
import { eventSlug, getFirstPublishedEvent, listBooks } from "../../services/historyService";
import { historyPath } from "../../utils/seo";

export default function HistoryBookIndex({ books }) {
    const allBooks = books ?? listBooks();
    const oldTestament = allBooks.filter((book) => book.testament === "OT");
    const newTestament = allBooks.filter((book) => book.testament === "NT");
    const renderGroup = (label, group) => (
        <section aria-labelledby={`history-books-${label.toLowerCase().replace(" ", "-")}-heading`}>
            <h2 id={`history-books-${label.toLowerCase().replace(" ", "-")}-heading`}>{label}</h2>
            <ul className="history-book-list">
                {group.map((book) => {
                    // A book with published events opens its first event
                    // directly — the book URL redirects there anyway. A
                    // book with none keeps its Upcoming page at the
                    // book URL.
                    const firstEvent = book.hasEvents ? getFirstPublishedEvent(book.id) : null;
                    const to = firstEvent
                        ? historyPath(book.id, eventSlug(firstEvent.id))
                        : historyPath(book.id);
                    return (
                    <li key={book.id} className="history-book-list-item">
                        <Link to={to} className="history-book-link">
                            <span className="history-book-name">{book.title}</span>
                            <span className="history-book-meta">
                                {book.chapterCount} {book.chapterCount === 1 ? "chapter" : "chapters"}
                                {" · "}
                                {book.hasEvents ? (
                                    <span>
                                        {book.eventCount} {book.eventCount === 1 ? "event" : "events"}
                                    </span>
                                ) : (
                                    <span className="history-book-upcoming">Upcoming</span>
                                )}
                            </span>
                        </Link>
                    </li>
                    );
                })}
            </ul>
        </section>
    );
    return (
        <div className="history-book-index">
            {renderGroup("Old Testament", oldTestament)}
            {renderGroup("New Testament", newTestament)}
        </div>
    );
}
