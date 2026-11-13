// One book: its introduction, its events in narrative order, the event
// timeline, and (on the event route) the open event panel.
//
// The book URL itself (/biblical-history/:book) no longer renders this
// page: it redirects to the book's first published event, or renders
// this page's Upcoming state when the book has no published events.
// The event route is the study page — the book's timeline with the
// event's panel open. Closing the panel returns to the book directory
// on the index page. Unknown book slugs, and events that do not exist
// or are not connected to this book, render the 404 page — never a
// blank page, never another book's event.
import { useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import LandingHeader from "../components/LandingHeader";
import Seo from "../components/Seo";
import HistoryBookHeader from "../components/History/HistoryBookHeader";
import HistoryDateLabel from "../components/History/HistoryDateLabel";
import HistoryEventPanel from "../components/History/HistoryEventPanel";
import HistoryTimeline from "../components/History/HistoryTimeline";
import {
    eventSlug,
    getBook,
    getBookTitle,
    getEventBySlug,
    listBooks,
    listEventsForBook,
} from "../services/historyService";
import {
    chapterPath,
    historyBookDescription,
    historyBookTitle,
    historyEventDescription,
    historyEventTitle,
    historyPath,
    pageUrl,
} from "../utils/seo";
import { formatScriptureRange } from "../utils/historyContent";
import NotFoundPage from "./NotFoundPage";
import "./LandingPage.css";
import "../components/History/History.css";

export default function BiblicalHistoryBookPage() {
    const { book: bookSlug, event: eventSlugParam } = useParams();
    const navigate = useNavigate();

    const bookTitle = getBookTitle(bookSlug);
    const bookEntry = bookSlug ? listBooks().find((entry) => entry.id === bookSlug) : null;
    const book = bookSlug ? getBook(bookSlug) : null;
    const events = bookSlug ? listEventsForBook(bookSlug) : [];

    const openEvent = eventSlugParam ? getEventBySlug(eventSlugParam) : null;
    const openEventEntry = openEvent
        ? events.find((entry) => entry.id === openEvent.id)
        : null;

    // Closing the panel returns to the book directory on the index
    // page. It must not navigate to the book URL: that URL redirects
    // to the book's first published event, so closing from Creation
    // would reopen Creation's panel (and closing from any later event
    // would switch to Creation) instead of closing.
    //
    // The book whose event was just open travels in location state:
    // the index opens its directory at that book and returns focus to
    // the book's entry there — the #161 focus return, restored at the
    // index level now that the book page is retired. Without the state
    // the index focuses nothing and focus would fall to BODY.
    const closePanel = useCallback(() => {
        navigate("/biblical-history#history-books", { state: { focusBook: bookSlug } });
    }, [navigate, bookSlug]);

    if (!bookTitle) {
        return <NotFoundPage />;
    }
    // An event that exists but is not connected to this book is a 404,
    // not a redirect: silently substituting another book's framing would
    // misstate the connection.
    if (eventSlugParam && (!openEvent || !openEventEntry)) {
        return <NotFoundPage />;
    }

    const eventWithBookNote = openEvent && openEventEntry
        ? { ...openEvent, bookNote: openEventEntry.bookNote }
        : openEvent;

    const firstEvent = events[0] ?? null;

    const title = openEvent
        ? historyEventTitle(openEvent.title, formatScriptureRange(openEvent.primaryScripture))
        : historyBookTitle(bookTitle);
    const description = openEvent
        ? historyEventDescription(openEvent.title, formatScriptureRange(openEvent.primaryScripture))
        : historyBookDescription(bookTitle, events.length);
    // Canonical never points at a book-page URL: the book URL has no
    // view of its own. An open event canonicalizes to its event URL;
    // the Upcoming stub canonicalizes to the index — it is not in the
    // sitemap and must not mint a book-page URL of its own.
    const canonical = pageUrl(
        openEvent ? historyPath(bookSlug, eventSlug(openEvent.id)) : "/biblical-history",
    );

    return (
        <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)]">
            <Seo title={title} description={description} canonical={canonical} />
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
            <main id="landing-main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-8">
                <nav aria-label="Breadcrumb" className="mb-6 text-sm text-[var(--text-muted)]">
                    <Link to="/biblical-history#history-books" className="text-[var(--color-brand)]">
                        All books
                    </Link>
                    {" / "}
                    {firstEvent ? (
                        <Link
                            to={historyPath(bookSlug, eventSlug(firstEvent.id))}
                            className="text-[var(--color-brand)]"
                            aria-current={openEvent ? undefined : "page"}
                        >
                            {bookTitle}
                        </Link>
                    ) : (
                        <span aria-current="page">{bookTitle}</span>
                    )}
                    {openEvent && (
                        <>
                            {" / "}
                            <span aria-current="page">{openEvent.title}</span>
                        </>
                    )}
                </nav>

                {book ? (
                    <HistoryBookHeader book={book} bookTitle={bookTitle} eventCount={events.length} />
                ) : (
                    <header className="history-book-header">
                        <p className="history-book-eyebrow">
                            Biblical History · {bookEntry?.testament === "NT" ? "New Testament" : "Old Testament"}
                        </p>
                        <h1>{bookTitle}</h1>
                        <p className="history-book-meta">
                            No historical events published yet — more coming soon.
                            {" · "}
                            <Link to={chapterPath(bookTitle, 1)}>Read {bookTitle} 1 in the Bible</Link>
                        </p>
                    </header>
                )}

                {events.length > 0 ? (
                    <>
                        <section aria-labelledby="history-book-events-heading">
                            <h2 id="history-book-events-heading" className="mb-3 text-xl">
                                Events in {bookTitle}
                            </h2>
                            <ul className="history-book-list">
                                {events.map((event) => (
                                    <li key={event.id} className="history-book-list-item">
                                        <Link
                                            id={`history-event-link-${eventSlug(event.id)}`}
                                            to={historyPath(bookSlug, eventSlug(event.id))}
                                            className="history-book-link"
                                        >
                                            <span>
                                                <span className="history-book-name block">{event.title}</span>
                                                <span className="block text-sm text-[var(--text-muted)]">
                                                    {event.bookNote}
                                                </span>
                                            </span>
                                            <HistoryDateLabel date={event.date} />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </section>
                        <div className="mt-6">
                            <HistoryTimeline
                                events={events}
                                currentEventId={openEvent?.id ?? null}
                                bookId={bookSlug}
                            />
                        </div>
                    </>
                ) : (
                    <p className="text-[var(--text-muted)]">
                        Historical events for {bookTitle} are coming soon. The book
                        itself is already in the reader — start there.
                    </p>
                )}
            </main>

            {eventWithBookNote && (
                <HistoryEventPanel
                    key={eventWithBookNote.id}
                    event={eventWithBookNote}
                    bookId={bookSlug}
                    onClose={closePanel}
                />
            )}
        </div>
    );
}

// The event route renders the book page shell with the event's panel open:
// BiblicalHistoryEventPage is the thin wrapper that renders this page.
