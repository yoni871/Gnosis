// The Story section: the 80–150-word Overview prose, and "Why This
// Context Matters" as its own labelled subsection.
//
// The event title, primary Scripture reference, and date already head
// the study page itself, so this section renders prose only — no
// repeated title block.
//
// A Key Takeaway opens the Story: the event's book note, already
// authored editorial content, set apart as a callout so the reader
// meets the event's essence before the prose. It is the only place the
// book note appears in the study — the header no longer repeats it.
// Events without a book note simply have no takeaway.
import HistoryMarkdown from "./HistoryMarkdown";

export default function HistoryOverview({ sections, event }) {
    return (
        <div className="history-overview">
            <h2 className="history-overview-heading">The Story</h2>
            {event?.bookNote && (
                <aside className="history-takeaway" aria-labelledby="history-takeaway-heading">
                    <p className="history-takeaway-eyebrow" id="history-takeaway-heading">
                        Key Takeaway
                    </p>
                    <p className="history-takeaway-text">{event.bookNote}</p>
                </aside>
            )}
            <HistoryMarkdown markdown={sections?.overview?.markdown} />
            <section className="history-why" aria-labelledby="history-why-heading">
                <h3 id="history-why-heading">Why This Context Matters</h3>
                <HistoryMarkdown markdown={sections?.whyItMatters?.markdown} />
            </section>
        </div>
    );
}
