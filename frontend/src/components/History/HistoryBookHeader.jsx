// Book title, testament, introduction, event count, and a link into the
// reader at chapter 1.
import { Link } from "react-router-dom";
import { chapterPath } from "../../utils/seo";
import HistoryMarkdown from "./HistoryMarkdown";

export default function HistoryBookHeader({ book, bookTitle, eventCount }) {
    if (!book) return null;
    return (
        <header className="history-book-header">
            <p className="history-book-eyebrow">
                Biblical History · {book.testament === "OT" ? "Old Testament" : "New Testament"}
            </p>
            <h1>{bookTitle}</h1>
            <div className="history-book-introduction">
                <HistoryMarkdown markdown={book.introduction} />
            </div>
            <p className="history-book-meta">
                {eventCount === 0
                    ? "No historical events published yet — more coming soon."
                    : `${eventCount} ${eventCount === 1 ? "historical event" : "historical events"}`}
                {" · "}
                <Link to={chapterPath(bookTitle, 1)}>Read {bookTitle} 1 in the Bible</Link>
            </p>
        </header>
    );
}
