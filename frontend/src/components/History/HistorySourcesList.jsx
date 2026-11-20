// The sources for one event, resolved from the source registry and
// rendered as a labelled list. Each entry carries an id anchor
// (`#source-<id>`) so footnote links in the prose resolve here.
//
// Source verification status (`verification`, `verificationDetail`) is
// an internal editorial record in the registry and is deliberately NOT
// rendered here: the public list shows author, title, publication
// details, and the original-source link only. Contested-interpretation
// qualifications live in the prose and connection notes, not in badges.
import { getSource } from "../../services/historyService";

function formatSource(source) {
    const parts = [];
    if (source.author) parts.push(source.author);
    if (source.title) parts.push(source.title);
    if (source.publisher) parts.push(source.publisher);
    if (source.year) parts.push(String(source.year));
    if (source.pagesOrSection) parts.push(source.pagesOrSection);
    return parts.join(". ");
}

export default function HistorySourcesList({ sourceIds = [] }) {
    const sources = sourceIds.map((id) => ({ id, source: getSource(id) })).filter((entry) => entry.source);
    if (sources.length === 0) return null;
    return (
        <section className="history-sources" aria-labelledby="history-sources-heading">
            <h3 id="history-sources-heading">Sources</h3>
            <ol>
                {sources.map(({ id, source }) => (
                    <li key={id} id={`source-${id}`}>
                        <span>{formatSource(source)}</span>
                        {source.url && (
                            <>
                                {" "}
                                <a href={source.url} target="_blank" rel="noreferrer">
                                    View source
                                </a>
                            </>
                        )}
                    </li>
                ))}
            </ol>
        </section>
    );
}
