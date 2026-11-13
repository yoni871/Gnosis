// The Story section: the 80–150-word Overview prose, and "Why This
// Context Matters" as its own labelled subsection.
//
// The event title, primary Scripture reference, and date already head
// the study page itself, so this section renders prose only — no
// repeated title block.
import HistoryMarkdown from "./HistoryMarkdown";

export default function HistoryOverview({ sections }) {
    return (
        <div className="history-overview">
            <HistoryMarkdown markdown={sections?.overview?.markdown} />
            <section aria-labelledby="history-why-heading">
                <h3 id="history-why-heading">Why This Context Matters</h3>
                <HistoryMarkdown markdown={sections?.whyItMatters?.markdown} />
            </section>
        </div>
    );
}
