// Biblical History index: all 66 books, grouped by testament, with
// published-event counts and a generic "Upcoming" state for the rest.
// No unpublished event titles ship anywhere on this page.
import Header from "../components/Header/Header";
import Seo from "../components/Seo";
import HistoryBookIndex from "../components/History/HistoryBookIndex";
import { historyIndexDescription, historyIndexTitle, pageUrl } from "../utils/seo";
import "../components/History/History.css";

export default function BiblicalHistoryIndexPage() {
    return (
        <div className="min-h-screen bg-[var(--bg-page)] pt-[58px] text-[var(--text-primary)]">
            <Seo
                title={historyIndexTitle()}
                description={historyIndexDescription()}
                canonical={pageUrl("/biblical-history")}
            />
            <Header />
            <main className="mx-auto max-w-3xl px-6 py-8">
                <p className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-[var(--color-brand)] uppercase">
                    Biblical History
                </p>
                <h1 className="mb-3 text-3xl">Biblical History</h1>
                <p className="mb-8 max-w-[68ch] leading-7 text-[var(--text-muted)]">
                    Explore the ancient world behind the biblical story, book by
                    book — the peoples, empires, and events that surround the
                    narrative, with the historical context that helps each passage
                    make sense.
                </p>
                <HistoryBookIndex />
            </main>
        </div>
    );
}
