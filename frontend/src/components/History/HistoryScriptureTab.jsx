// The Scripture tab — assembled, not written. The primary passage, the
// related passages, and every connection for this event, grouped by
// relationship type (Standards §5.1), each with its short explanation, a
// reader link, and its claim-confidence badge. There is no ## Scripture
// heading in the .md file: this tab is built from the event JSON, so a
// reference can never be typed one way in prose and another way in the
// connection record.
//
// When `onOpenPassage` is given (the study page), a reference is a
// button that opens the passage in the Scripture companion beside the
// study instead of navigating away; without it (standalone use) the
// reference stays a plain reader link, as before.
import { Link } from "react-router-dom";
import { formatScriptureRange, readerLinkFor } from "../../services/historyService";
import HistoryConfidenceBadge from "./HistoryConfidenceBadge";

const CONNECTION_GROUPS = [
    ["direct-account", "Direct Account"],
    ["historical-setting", "Historical Setting"],
    ["prophetic-reference", "Prophetic Reference"],
    ["thematic", "Thematic Connection"],
    ["background", "Background Reference"],
];

export default function HistoryScriptureTab({ event, onOpenPassage }) {
    if (!event) return null;
    const primaryLabel = formatScriptureRange(event.primaryScripture);
    const primaryLink = readerLinkFor(event.primaryScripture);
    const connections = event.connections ?? [];

    const renderReference = (ref, label, link) => {
        if (onOpenPassage) {
            return (
                <button
                    type="button"
                    className="history-connection-open"
                    onClick={() => onOpenPassage(ref)}
                    aria-label={`Read ${label} alongside the study`}
                >
                    {label}
                </button>
            );
        }
        return link ? <Link to={link}>{label}</Link> : <span>{label}</span>;
    };

    return (
        <div className="history-scripture-tab">
            <h2 id="history-section-scripture-heading">Scripture Connections</h2>
            <p className="history-confidence-note">
                These labels describe how closely a passage relates to this event in wording and theme —
                not how certain every interpretive claim in its note is. Interpretive readings are
                qualified in the notes themselves.
            </p>
            <section aria-labelledby="history-primary-passage-heading">
                <h3 id="history-primary-passage-heading">Primary Passage</h3>
                <p>
                    {renderReference(event.primaryScripture, primaryLabel, primaryLink)}
                </p>
            </section>
            {CONNECTION_GROUPS.map(([type, label]) => {
                const group = connections.filter((conn) => conn.type === type);
                if (group.length === 0) return null;
                return (
                    <section key={type} aria-labelledby={`history-connections-${type}-heading`}>
                        <h3 id={`history-connections-${type}-heading`}>{label}</h3>
                        <ul className="history-connection-list">
                            {group.map((conn, index) => {
                                const rangeLabel = formatScriptureRange(conn);
                                const link = readerLinkFor(conn);
                                return (
                                    <li key={`${conn.bookId}-${conn.startChapter}-${index}`}>
                                        <p className="history-connection-reference">
                                            {renderReference(conn, rangeLabel, link)}
                                            {" "}
                                            <HistoryConfidenceBadge confidence={conn.confidence} />
                                        </p>
                                        <p className="history-connection-note">{conn.note}</p>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
}
