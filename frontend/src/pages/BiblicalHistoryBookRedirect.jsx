import { Navigate, useLocation, useParams } from "react-router-dom";
import { categorySlug, eventSlug, getBookTitle, getPublishedHistoryRoute, listBookEntries } from "../services/historyService";
import { historyPath } from "../utils/seo";
import NotFoundPage from "./NotFoundPage";

// Client-side fallback for old links. Vercel issues permanent redirects too.
export default function BiblicalHistoryBookRedirect() {
    const { book, event } = useParams();
    const location = useLocation();
    if (!getBookTitle(book)) return <NotFoundPage />;
    const entries = listBookEntries(book);
    const first = entries[0];
    if (!first) return <Navigate to="/biblical-history#history-books" replace state={{ focusBook: book }} />;
    const firstSlug = first.kind === "category" ? categorySlug(first.id) : eventSlug(first.id);
    const slug = event ?? firstSlug;
    const matched = entries.find((entry) => (entry.kind === "category" ? categorySlug(entry.id) : eventSlug(entry.id)) === slug);
    if (!matched || getPublishedHistoryRoute(slug)?.entry.id !== matched.id) return <NotFoundPage />;
    return <Navigate to={`${historyPath(book, slug)}${location.search}${location.hash}`} replace />;
}
