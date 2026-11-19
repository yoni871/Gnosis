// The event study page: a standalone page, not a panel over the book
// page. The study workspace (Story / Context / Connections, Sources,
// Scripture companion, timeline) renders inline in the page flow under
// the landing navbar; there is no book-page shell behind it, no
// backdrop, and no modal behaviour. Browser Back returns to wherever
// the visitor came from — the homepage when they arrived from there,
// since the book route redirects (replace) to the event.
//
// The URL slug resolves to EITHER an event or a category: the category
// slug occupies the same `:event` param position, so no route change was
// needed. Unknown book slugs, and records that do not exist or are not
// connected to this book, render the 404 page — never a blank page,
// never another book's record. The study remounts per record (keyed by
// record id), so record-to-record navigation through the timeline always
// starts the new record fresh: Story tab, companion open on the new
// record's primary passage.
import { useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import LandingHeader from "../components/LandingHeader";
import Seo from "../components/Seo";
import HistoryEventStudy from "../components/History/HistoryEventStudy";
import {
    categorySlug,
    eventSlug,
    getBookTitle,
    getCategoryBySlug,
    getEventBySlug,
    listBookEntries,
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
    const entries = bookSlug ? listBookEntries(bookSlug) : [];

    // The slug is an event slug or a category slug; the record must be
    // listed in this book's entries, in narrative order.
    const openRecord = eventSlugParam
        ? (getEventBySlug(eventSlugParam) ?? getCategoryBySlug(eventSlugParam))
        : null;
    const openRecordEntry = openRecord
        ? entries.find((entry) => entry.id === openRecord.id)
        : null;

    const recordSlug = (record) =>
        (record.kind === "category" ? categorySlug(record.id) : eventSlug(record.id));

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

    // A record that exists but is not connected to this book is a 404,
    // not a redirect: silently substituting another book's framing would
    // misstate the connection.
    if (!bookTitle || !openRecord || !openRecordEntry) {
        return <NotFoundPage />;
    }

    const recordWithBookNote = { ...openRecord, kind: openRecordEntry.kind, bookNote: openRecordEntry.bookNote };
    const firstEntry = entries[0] ?? null;

    return (
        <div className="history-event-root min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)]">
            <Seo
                title={historyEventTitle(openRecord.title, formatScriptureRange(openRecord.primaryScripture))}
                description={historyEventDescription(openRecord.title, formatScriptureRange(openRecord.primaryScripture))}
                canonical={pageUrl(historyPath(bookSlug, recordSlug(recordWithBookNote)))}
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
                    {firstEntry ? (
                        <Link
                            to={historyPath(bookSlug, recordSlug(firstEntry))}
                            className="text-[var(--color-brand)]"
                        >
                            {bookTitle}
                        </Link>
                    ) : (
                        <span>{bookTitle}</span>
                    )}
                    {" / "}
                    <span aria-current="page">{openRecord.title}</span>
                </nav>

                <HistoryEventStudy
                    key={recordWithBookNote.id}
                    record={recordWithBookNote}
                    bookId={bookSlug}
                    onBackToBooks={backToBooks}
                />
            </main>
        </div>
    );
}
