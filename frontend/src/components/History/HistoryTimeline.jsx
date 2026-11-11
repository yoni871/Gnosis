// The continuous timeline strip, anchored at the bottom of the event
// panel (and under the event list on the book page).
//
// No library, no proportional-to-year axis: the strip is evenly spaced,
// one node per event, in biblical narrative order — even spacing claims
// sequence, not elapsed time. Dates appear as labels, not as positions.
//
// Navigation is click/tap on a node, or keyboard only: Left/Right arrows
// move between events, Home/End jump to the first/last, with roving
// tabindex and a visible focus indicator. There are NO previous/next
// buttons in the visual UI (correction 2), so the strip carries an
// accessible label and visible keyboard instructions, and the book page's
// event list is its full text alternative.
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { eventSlug, formatHistoryDateLabel } from "../../services/historyService";
import { historyPath } from "../../utils/seo";

export default function HistoryTimeline({ events = [], currentEventId, bookId }) {
    const navigate = useNavigate();
    const nodeRefs = useRef([]);
    const currentIndex = events.findIndex((event) => event.id === currentEventId);
    // Roving tabindex needs exactly one tab stop: the open event when one
    // is open, otherwise the first node.
    const focusIndex = currentIndex >= 0 ? currentIndex : 0;

    useEffect(() => {
        if (currentIndex < 0) return;
        const node = nodeRefs.current[currentIndex];
        if (!node) return;
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        // jsdom (tests) has no scrollIntoView; guard the call.
        node.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
    }, [currentIndex]);

    if (events.length === 0) return null;

    const goTo = (index) => {
        const event = events[index];
        if (!event) return;
        navigate(historyPath(bookId, eventSlug(event.id)));
        nodeRefs.current[index]?.focus();
    };

    const onKeyDown = (event) => {
        // Move relative to the focused node (not necessarily the open
        // event): the strip is navigable even with no event open.
        const focusedIndex = nodeRefs.current.findIndex((node) => node === document.activeElement);
        const from = focusedIndex >= 0 ? focusedIndex : focusIndex;
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            goTo((from - 1 + events.length) % events.length);
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            goTo((from + 1) % events.length);
        } else if (event.key === "Home") {
            event.preventDefault();
            goTo(0);
        } else if (event.key === "End") {
            event.preventDefault();
            goTo(events.length - 1);
        }
    };

    return (
        <nav className="history-timeline" aria-label="Events in this book">
            <p className="history-timeline-hint" id="history-timeline-hint">
                Use the Left and Right arrow keys to move between events.
            </p>
            <ul
                className="history-timeline-strip"
                aria-describedby="history-timeline-hint"
                onKeyDown={onKeyDown}
            >
                {events.map((event, index) => {
                    const isCurrent = event.id === currentEventId;
                    return (
                        <li key={event.id} className="history-timeline-node-item">
                            <button
                                ref={(element) => {
                                    nodeRefs.current[index] = element;
                                }}
                                type="button"
                                className={`history-timeline-node${isCurrent ? " history-timeline-node--current" : ""}`}
                                aria-current={isCurrent ? "true" : undefined}
                                tabIndex={index === focusIndex ? 0 : -1}
                                onClick={() => goTo(index)}
                            >
                                <span className="history-timeline-node-dot" aria-hidden="true" />
                                <span className="history-timeline-node-title">{event.title}</span>
                                <span className="history-timeline-node-date">
                                    {formatHistoryDateLabel(event.date)}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
