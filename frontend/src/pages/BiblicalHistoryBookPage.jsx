// One book: its introduction, its events in narrative order, the event
// timeline, and (on the event route) the open event panel.
//
// The event route is a view of this page, not a separate page: the event
// exists in the context of a book, so landing directly on
// /biblical-history/:book/:event shows the book's timeline with the
// event's panel open, and Back returns to the book. Unknown book slugs,
// and events that do not exist or are not connected to this book, render
// the 404 page — never a blank page, never another book's event.
import { useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header/Header";
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

    const closePanel = useCallback(() => {
        navigate(historyPath(bookSlug));
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

    const title = openEvent
        ? historyEventTitle(openEvent.title, formatScriptureRange(openEvent.primaryScripture))
        : historyBookTitle(bookTitle);
    const description = openEvent
        ? historyEventDescription(openEvent.title, formatScriptureRange(openEvent.primaryScripture))
        : historyBookDescription(bookTitle, events.length);
    const canonical = pageUrl(
        openEvent ? historyPath(bookSlug, eventSlug(openEvent.id)) : historyPath(bookSlug),
    );

    return (
        <div className="min-h-screen bg-[var(--bg-page)] pt-[58px] text-[var(--text-primary)]">
            <Seo title={title} description={description} canonical={canonical} />
            <Header />
            <main className="mx-auto max-w-3xl px-6 py-8">
                <nav aria-label="Breadcrumb" className="mb-6 text-sm text-[var(--text-muted)]">
                    <Link to="/biblical-history" className="text-[var(--color-brand)]">
                        All books
                    </Link>
                    {" / "}
                    <span aria-current="page">{bookTitle}</span>
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
