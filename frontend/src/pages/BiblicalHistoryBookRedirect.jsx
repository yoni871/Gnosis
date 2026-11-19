// A book landing page lists only records from the published History bundle.
// Books without published entries return to the directory; unknown books 404.
import { Link, Navigate, useParams } from "react-router-dom";
import LandingHeader from "../components/LandingHeader";
import LandingFooter from "../components/LandingFooter";
import Seo from "../components/Seo";
import HistoryDateLabel from "../components/History/HistoryDateLabel";
import { categorySlug, eventSlug, getBook, getBookTitle, listBookEntries } from "../services/historyService";
import { historyPath, pageUrl } from "../utils/seo";
import NotFoundPage from "./NotFoundPage";
import "./LandingPage.css";
import "../components/History/History.css";

export default function BiblicalHistoryBookRedirect() {
    const { book: bookSlug } = useParams();
    const title = bookSlug ? getBookTitle(bookSlug) : null;
    if (!title) return <NotFoundPage />;

    const entries = listBookEntries(bookSlug);
    if (entries.length === 0) {
        return <Navigate to="/biblical-history#history-books" replace state={{ focusBook: bookSlug }} />;
    }
    const book = getBook(bookSlug);

    return (
        <div className="public-page history-book-page">
            <Seo title={`${title} | Biblical History | Gnosis`}
                description={book?.introduction ?? `Explore published Biblical History studies in ${title}.`}
                canonical={pageUrl(historyPath(bookSlug))} />
            <LandingHeader hero solid />
            <main id="landing-main" tabIndex={-1} className="history-book-landing">
                <Link className="history-book-back" to="/biblical-history#history-books">All books</Link>
                <p className="history-study-eyebrow">Biblical History</p>
                <h1>{title}</h1>
                {book?.introduction && <p className="history-book-introduction">{book.introduction}</p>}
                <h2>Published studies</h2>
                <ol className="history-book-entry-list">
                    {entries.map((entry) => (
                        <li key={entry.id}>
                            <Link to={historyPath(bookSlug, entry.kind === "category" ? categorySlug(entry.id) : eventSlug(entry.id))}>
                                <span className="history-book-entry-kind">{entry.kind === "category" ? "Study" : "Event"}</span>
                                <strong>{entry.title}</strong>
                                <HistoryDateLabel date={entry.date} />
                                {entry.bookNote && <span className="history-book-entry-note">{entry.bookNote}</span>}
                            </Link>
                        </li>
                    ))}
                </ol>
            </main>
            <LandingFooter />
        </div>
    );
}
