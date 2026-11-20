// The Ancient World section: the event's ### subsections as expandable
// subsections. The first subsection starts open; every subsection is a
// real button, so the content is reachable by keyboard, touch, and
// screen reader alike.
import { useState } from "react";
import HistoryMarkdown from "./HistoryMarkdown";

export default function HistoryAncientWorld({ subsections = [] }) {
    const [open, setOpen] = useState(() => (subsections.length > 0 ? new Set([0]) : new Set()));
    if (subsections.length === 0) return null;
    const toggle = (index) => {
        setOpen((current) => {
            const next = new Set(current);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };
    return (
        <div className="history-ancient-world">
            <h2 id="history-section-ancient-world-heading">Ancient World</h2>
            {subsections.map((sub, index) => {
                const isOpen = open.has(index);
                const buttonId = `history-ancient-sub-${index}-button`;
                const panelId = `history-ancient-sub-${index}-panel`;
                return (
                    <section key={sub.heading} className="history-ancient-subsection">
                        <h3>
                            <button
                                type="button"
                                id={buttonId}
                                aria-expanded={isOpen}
                                aria-controls={panelId}
                                onClick={() => toggle(index)}
                            >
                                <span>{sub.heading}</span>
                                <span aria-hidden="true">{isOpen ? "−" : "+"}</span>
                            </button>
                        </h3>
                        {isOpen && (
                            <div id={panelId} role="region" aria-labelledby={buttonId}>
                                <HistoryMarkdown markdown={sub.markdown} />
                            </div>
                        )}
                    </section>
                );
            })}
        </div>
    );
}
