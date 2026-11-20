// A flat published study URL resolves to an event or category and its book.
// The study remounts per record so timeline navigation starts each entry at
// Story with its own primary Scripture passage.
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import LandingHeader from "../components/LandingHeader";
import Seo from "../components/Seo";
import HistoryEventStudy from "../components/History/HistoryEventStudy";
import {
    categorySlug,
    eventSlug,
    getBookTitle,
    getPublishedHistoryRoute,
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
    const { slug } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const route = slug ? getPublishedHistoryRoute(slug) : null;
    const bookSlug = route?.bookId;
    const openRecordEntry = route?.entry;
    const openRecord = openRecordEntry;

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
    const backToBooks = () => {
        navigate("/biblical-history#history-books", { state: { focusBook: bookSlug } });
    };

    // Old book URLs go straight to their first published entry. Unknown
    // flat slugs stay 404 instead of selecting an unrelated entry.
    if (!route && getBookTitle(slug)) {
        const first = listBookEntries(slug)[0];
        if (!first) return <Navigate to="/biblical-history#history-books" replace state={{ focusBook: slug }} />;
        const firstSlug = recordSlug(first);
        return <Navigate to={`${historyPath(slug, firstSlug)}${location.search}${location.hash}`} replace />;
    }
    if (!route) {
        return <NotFoundPage />;
    }

    const recordWithBookNote = { ...openRecord, kind: openRecordEntry.kind, bookNote: openRecordEntry.bookNote };

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
                <LandingHeader hero solid hideExploreAction />
            </div>
            <main id="landing-main" tabIndex={-1} className="history-event-page">
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
