// The event study page: a standalone page, not a panel over the book
// page. The study workspace (Story / Context / Connections, Sources,
// Scripture companion, timeline) renders inline in the page flow under
// the landing navbar; there is no book-page shell behind it, no
// backdrop, and no modal behaviour. Browser Back returns to wherever
// the visitor came from — the homepage when they arrived from there,
// since the book route redirects (replace) to the event.
//
// Unknown book slugs, and events that do not exist or are not
// connected to this book, render the 404 page — never a blank page,
// never another book's event. The study remounts per event (keyed by
// event id), so event-to-event navigation through the timeline always
// starts the new event fresh: Story tab, companion open on the new
// event's primary passage.
import { useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import LandingHeader from "../components/LandingHeader";
import Seo from "../components/Seo";
import HistoryEventStudy from "../components/History/HistoryEventStudy";
import {
    eventSlug,
    getBookTitle,
    getEventBySlug,
    listEventsForBook,
} from "../services/historyService";
import { formatScriptureRange } from "../utils/historyContent";
import {
    historyEventDescription,
    historyEventTitle,
    historyPath,
    pageUrl,
} from "../utils/seo";
import NotFoundPage from "./NotFoundPage";
import "./LandingPage.css";
import "../components/History/History.css";

export default function BiblicalHistoryEventPage() {
    const { book: bookSlug, event: eventSlugParam } = useParams();
    const navigate = useNavigate();

    const bookTitle = getBookTitle(bookSlug);
    const events = bookSlug ? listEventsForBook(bookSlug) : [];

    const openEvent = eventSlugParam ? getEventBySlug(eventSlugParam) : null;
    const openEventEntry = openEvent
        ? events.find((entry) => entry.id === openEvent.id)
        : null;

    // Back to browsing returns to the book directory on the index
    // page. It must not navigate to the book URL: that URL redirects
    // to the book's first published event, so leaving from Creation
    // would reopen Creation instead of leaving — and leaving from any
    // later event would switch to Creation.
    //
    // The book whose event was just open travels in location state:
    // the index opens its directory at that book and returns focus to
    // the book's entry there — the #161 focus return, restored at the
    // index level now that the book page is retired. Without the state
    // the index focuses nothing and focus would fall to BODY.
    const backToBooks = useCallback(() => {
        navigate("/biblical-history#history-books", { state: { focusBook: bookSlug } });
    }, [navigate, bookSlug]);

    // An event that exists but is not connected to this book is a 404,
    // not a redirect: silently substituting another book's framing would
    // misstate the connection.
    if (!bookTitle || !openEvent || !openEventEntry) {
        return <NotFoundPage />;
    }

    const eventWithBookNote = { ...openEvent, bookNote: openEventEntry.bookNote };
    const firstEvent = events[0] ?? null;

    return (
        <div className="history-event-root min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)]">
            <Seo
                title={historyEventTitle(openEvent.title, formatScriptureRange(openEvent.primaryScripture))}
                description={historyEventDescription(openEvent.title, formatScriptureRange(openEvent.primaryScripture))}
                canonical={pageUrl(historyPath(bookSlug, eventSlug(openEvent.id)))}
            />
            {/*
              The study experience uses the landing navbar, not the
              reader header: logo left, Explore dropdown before the
              account area, profile/name or Sign In / Sign Up far right
              — no search, translation, layout, or commentary controls.
              The header is the About-page treatment (hero + solid):
              hero for the Explore dropdown and account actions, solid
              so it stays readable over the page instead of transparent
              over a photo. It lives in its own public-page wrapper so
              the landing navbar's scoped styles and variables apply
              without restyling the study interface below it.
            */}
            <div className="public-page">
                <LandingHeader hero solid />
            </div>
            <main id="landing-main" tabIndex={-1} className="history-event-page">
                <nav aria-label="Breadcrumb" className="history-event-breadcrumb">
                    <Link to="/biblical-history#history-books" className="text-[var(--color-brand)]">
                        All books
                    </Link>
                    {" / "}
                    {firstEvent ? (
                        <Link
                            to={historyPath(bookSlug, eventSlug(firstEvent.id))}
                            className="text-[var(--color-brand)]"
                        >
                            {bookTitle}
                        </Link>
                    ) : (
                        <span>{bookTitle}</span>
                    )}
                    {" / "}
                    <span aria-current="page">{openEvent.title}</span>
                </nav>

                <HistoryEventStudy
                    key={eventWithBookNote.id}
                    event={eventWithBookNote}
                    bookId={bookSlug}
                    onBackToBooks={backToBooks}
                />
            </main>
        </div>
    );
}
