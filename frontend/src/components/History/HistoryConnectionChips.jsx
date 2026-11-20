// Cross-book chips: "Also in: Isaiah · 2 Chronicles". Each chip links to
// the SAME canonical record under another book, where the book-specific
// note differs and the research does not. The record rendered under each
// book is byte-for-byte the same Overview and Ancient World; only the
// note, the framing primary reference, and the surrounding timeline differ.
// The record may be an event or a category: the slug comes from its kind.
import { Link } from "react-router-dom";
import { categorySlug, eventSlug } from "../../services/historyService";
import { historyPath } from "../../utils/seo";

export default function HistoryConnectionChips({ event, books = [], currentBookId }) {
    if (!event) return null;
    const others = books.filter((book) => book.id !== currentBookId);
    if (others.length === 0) return null;
    const slug = event.kind === "category" ? categorySlug(event.id) : eventSlug(event.id);
    return (
        <p className="history-connection-chips" aria-label="Also in">
            <span>Also in: </span>
            {others.map((book, index) => (
                <span key={book.id}>
                    {index > 0 && <span aria-hidden="true"> · </span>}
                    <Link to={historyPath(book.id, slug)}>{book.title}</Link>
                </span>
            ))}
        </p>
    );
}
