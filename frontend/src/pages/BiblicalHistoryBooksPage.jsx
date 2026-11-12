import Header from "../components/Header/Header";
import HistoryBookIndex from "../components/History/HistoryBookIndex";
import Seo from "../components/Seo";
import { historyBooksDescription, historyBooksTitle, pageUrl } from "../utils/seo";
import "../components/History/History.css";

export default function BiblicalHistoryBooksPage() {
    return (
        <div className="min-h-screen bg-[var(--bg-page)] pt-[58px] text-[var(--text-primary)]">
            <Seo title={historyBooksTitle()} description={historyBooksDescription()} canonical={pageUrl("/biblical-history/books")} />
            <Header />
            <main className="mx-auto max-w-3xl px-6 py-8">
                <p className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-[var(--color-brand)] uppercase">Biblical History</p>
                <h1 className="mb-3 text-3xl">Browse by Bible Book</h1>
                <p className="mb-8 max-w-[68ch] leading-7 text-[var(--text-muted)]">Explore the ancient world behind the biblical story, book by book.</p>
                <HistoryBookIndex />
            </main>
        </div>
    );
}
