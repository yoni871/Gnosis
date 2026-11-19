// The book route has no view of its own. Books with published events
// redirect to the book's first published event (by narrative order), so
// old bookmarks land on the study page with that event open. Books with
// no published events have no event to redirect to — they redirect to
// the Biblical History homepage's book directory, where the book is
// marked Coming Soon: the directory opens at that book (via the same
// location-state focus return the study page's close button uses) so
// the visitor lands on the book, not just the top of the homepage.
// Unknown book slugs keep the 404 page.
import { Navigate, useParams } from "react-router-dom";
import { eventSlug, getBookTitle, getFirstPublishedEvent } from "../services/historyService";
import { historyPath } from "../utils/seo";
import NotFoundPage from "./NotFoundPage";

export default function BiblicalHistoryBookRedirect() {
    const { book: bookSlug } = useParams();

    if (!bookSlug || !getBookTitle(bookSlug)) {
        return <NotFoundPage />;
    }

    const firstEvent = getFirstPublishedEvent(bookSlug);
    if (firstEvent) {
        return (
            <Navigate
                to={historyPath(bookSlug, eventSlug(firstEvent.id))}
                replace
            />
        );
    }

    return (
        <Navigate
            to="/biblical-history#history-books"
            replace
            state={{ focusBook: bookSlug }}
        />
    );
}
