// The continuous timeline strip, anchored at the bottom of the event
// study page.
//
// No library, no proportional-to-year axis: the strip is evenly spaced,
// one node per entry, in biblical narrative order — even spacing claims
// sequence, not elapsed time. Dates appear as labels, not as positions.
//
// An entry is an event or a category: the book file's unified `entries`
// list drives the strip (via buildBookTimeline), so events and
// categories interleave in narrative order. Category nodes are visually
// distinguished with a "Category" eyebrow and state their kind in the
// node's accessible label, so the two kinds are never confused.
//
// Navigation is click/tap on a node, or keyboard only: Left/Right arrows
// move between entries, Home/End jump to the first/last, with roving
// tabindex and a visible focus indicator. There are NO previous/next
// buttons in the visual UI (correction 2), so the strip carries an
// accessible label and visible keyboard instructions, and the book page's
// event list is its full text alternative.
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { categorySlug, eventSlug, formatHistoryDateLabel } from "../../services/historyService";
import { historyPath } from "../../utils/seo";

export default function HistoryTimeline({ entries = [], currentEntryId, bookId }) {
    const navigate = useNavigate();
    const nodeRefs = useRef([]);
    const currentIndex = entries.findIndex((entry) => entry.id === currentEntryId);
    // Roving tabindex needs exactly one tab stop: the open entry when one
    // is open, otherwise the first node.
    const focusIndex = currentIndex >= 0 ? currentIndex : 0;

    useEffect(() => {
        if (currentIndex < 0) return;
        const node = nodeRefs.current[currentIndex];
        if (!node) return;
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        // Center within the strip only. scrollIntoView also moves the page
        // vertically, which made the fixed mobile timeline jump on navigation.
        const strip = node.closest(".history-timeline-strip");
        const item = node.parentElement;
        if (strip?.scrollTo && item) {
            strip.scrollTo({ left: item.offsetLeft + item.offsetWidth / 2 - strip.clientWidth / 2, behavior: reduced ? "auto" : "smooth" });
        }
    }, [currentIndex]);

    if (entries.length === 0) return null;

    const goTo = (index) => {
        const entry = entries[index];
        if (!entry) return;
        const slug = entry.kind === "category" ? categorySlug(entry.id) : eventSlug(entry.id);
        navigate(historyPath(bookId, slug));
        nodeRefs.current[index]?.focus({ preventScroll: true });
    };

    const onKeyDown = (event) => {
        // Move relative to the focused node (not necessarily the open
        // entry): the strip is navigable even with no entry open.
        const focusedIndex = nodeRefs.current.findIndex((node) => node === document.activeElement);
        const from = focusedIndex >= 0 ? focusedIndex : focusIndex;
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            goTo((from - 1 + entries.length) % entries.length);
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            goTo((from + 1) % entries.length);
        } else if (event.key === "Home") {
            event.preventDefault();
            goTo(0);
        } else if (event.key === "End") {
            event.preventDefault();
            goTo(entries.length - 1);
        }
    };

    return (
        <nav className="history-timeline" aria-label="Entries in this book">
            <p className="history-timeline-hint" id="history-timeline-hint">
                Use the Left and Right arrow keys to move between entries.
            </p>
            <ul
                className="history-timeline-strip"
                aria-describedby="history-timeline-hint"
                onKeyDown={onKeyDown}
            >
                {entries.map((entry, index) => {
                    const isCurrent = entry.id === currentEntryId;
                    const isCategory = entry.kind === "category";
                    const dateLabel = formatHistoryDateLabel(entry.date);
                    return (
                        <li key={entry.id} className="history-timeline-node-item">
                            <button
                                ref={(element) => {
                                    nodeRefs.current[index] = element;
                                }}
                                type="button"
                                className={`history-timeline-node${isCurrent ? " history-timeline-node--current" : ""}${isCategory ? " history-timeline-node--category" : ""}`}
                                title={`${entry.title} · ${isCategory ? "Category" : "Event"}${dateLabel ? ` · ${dateLabel}` : ""}`}
                                aria-current={isCurrent ? "true" : undefined}
                                aria-label={`${entry.title}, ${isCategory ? "Category" : "Event"}${dateLabel ? `, ${dateLabel}` : ""}`}
                                tabIndex={index === focusIndex ? 0 : -1}
                                onClick={() => goTo(index)}
                            >
                                <span className="history-timeline-node-dot" aria-hidden="true" />
                                {isCategory && (
                                    <span className="history-timeline-node-kind">Category</span>
                                )}
                                <span className="history-timeline-node-title">{entry.title}</span>
                                <span className="history-timeline-node-date">
                                    {dateLabel}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
