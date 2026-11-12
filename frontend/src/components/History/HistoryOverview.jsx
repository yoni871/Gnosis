// The Overview section: title, primary Scripture reference, date label,
// the 80–150-word prose, and "Why This Context Matters" as its own
// labelled subsection.
import { formatScriptureRange, readerLinkFor } from "../../services/historyService";
import { Link } from "react-router-dom";
import HistoryDateLabel from "./HistoryDateLabel";
import HistoryMarkdown from "./HistoryMarkdown";

export default function HistoryOverview({ event, sections }) {
    if (!event) return null;
    const rangeLabel = formatScriptureRange(event.primaryScripture);
    const readerLink = readerLinkFor(event.primaryScripture);
    return (
        <div className="history-overview">
            <h2 id="history-section-overview-heading">{event.title}</h2>
            <p className="history-primary-reference">
                {readerLink ? (
                    <Link to={readerLink}>{rangeLabel}</Link>
                ) : (
                    <span>{rangeLabel}</span>
                )}
                {" · "}
                <HistoryDateLabel date={event.date} />
            </p>
            <HistoryMarkdown markdown={sections?.overview?.markdown} />
            <section aria-labelledby="history-why-heading">
                <h3 id="history-why-heading">Why This Context Matters</h3>
                <HistoryMarkdown markdown={sections?.whyItMatters?.markdown} />
            </section>
        </div>
    );
}
