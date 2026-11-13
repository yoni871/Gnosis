// The book route has no view of its own: it redirects to the book's
// first published event (by narrative order), so old bookmarks land
// on the study page with that event open. Books with no published
// events have no event to redirect to — they keep their Upcoming page
// — and unknown book slugs keep the 404 page, so both cases render
// the book page instead of redirecting.
import { Navigate, useParams } from "react-router-dom";
import { eventSlug, getFirstPublishedEvent } from "../services/historyService";
import { historyPath } from "../utils/seo";
import BiblicalHistoryBookPage from "./BiblicalHistoryBookPage";

export default function BiblicalHistoryBookRedirect() {
    const { book: bookSlug } = useParams();
    const firstEvent = bookSlug ? getFirstPublishedEvent(bookSlug) : null;

    if (!firstEvent) {
        return <BiblicalHistoryBookPage />;
    }

    return (
        <Navigate
            to={historyPath(bookSlug, eventSlug(firstEvent.id))}
            replace
        />
    );
}
