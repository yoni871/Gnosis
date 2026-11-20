// The full-width timeline strip beneath the Doctrine workspace grid.
//
// No library, no proportional-to-year axis: the strip is evenly spaced,
// one node per interpretation, in the passage's provisional order —
// even spacing claims sequence, not elapsed time. Writing dates appear
// as labels, not as positions, and every date here is pending
// verification (the entries are demonstration data).
//
// Navigation is click/tap on a node, or keyboard only: Left/Right
// arrows move between entries, Home/End jump to the first/last, with
// roving tabindex and a visible focus indicator. Selecting a node
// updates the interpretation panel WITHOUT changing Scripture. A
// passage with no entries shows an honest empty state, not placeholder
// theologians.
import { useEffect, useRef } from "react";
import { DEMONSTRATION_NOTICE, getWorkDateLabel } from "../../data/doctrineStudies";

export default function DoctrineTimeline({
    entries = [],
    selectedId,
    passage,
    onSelect,
}) {
    const nodeRefs = useRef([]);
    const currentIndex = entries.findIndex((entry) => entry.interpretation.id === selectedId);
    // Roving tabindex needs exactly one tab stop: the selected entry
    // when one is selected, otherwise the first node.
    const focusIndex = currentIndex >= 0 ? currentIndex : 0;

    useEffect(() => {
        if (currentIndex < 0) return;
        const node = nodeRefs.current[currentIndex];
        if (!node) return;
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        // jsdom (tests) has no scrollIntoView; guard the call.
        node.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
    }, [currentIndex]);

    const select = (index) => {
        const entry = entries[index];
        if (!entry) return;
        onSelect?.(entry.interpretation.id);
        nodeRefs.current[index]?.focus();
    };

    const onKeyDown = (event) => {
        if (entries.length === 0) return;
        // Move relative to the focused node (not necessarily the selected
        // entry): the strip is navigable even with no entry selected.
        const focusedIndex = nodeRefs.current.findIndex((node) => node === document.activeElement);
        const from = focusedIndex >= 0 ? focusedIndex : focusIndex;
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            select((from - 1 + entries.length) % entries.length);
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            select((from + 1) % entries.length);
        } else if (event.key === "Home") {
            event.preventDefault();
            select(0);
        } else if (event.key === "End") {
            event.preventDefault();
            select(entries.length - 1);
        }
    };

    return (
        <nav className="doctrine-timeline" aria-label={`Historical interpretations of ${passage?.label ?? "this passage"}`}>
            <header className="doctrine-timeline-header">
                <p className="doctrine-panel-eyebrow">Historical Timeline</p>
                {entries.length > 0 && (
                    <p className="doctrine-timeline-hint" id="doctrine-timeline-hint">
                        Use the Left and Right arrow keys to move between interpreters.
                    </p>
                )}
                <p className="doctrine-demonstration-badge">Demonstration data</p>
            </header>
            {entries.length === 0 ? (
                <p className="doctrine-timeline-empty" role="status">
                    No historical interpretations have been added for {passage?.label ?? "this passage"} yet.
                    The timeline will list interpreters here once research verifies them.
                </p>
            ) : (
                <>
                    <ul
                        className="doctrine-timeline-strip"
                        aria-describedby="doctrine-timeline-hint"
                        onKeyDown={onKeyDown}
                    >
                        {entries.map((entry, index) => {
                            const isCurrent = entry.interpretation.id === selectedId;
                            return (
                                <li key={entry.interpretation.id} className="doctrine-timeline-node-item">
                                    <button
                                        ref={(element) => {
                                            nodeRefs.current[index] = element;
                                        }}
                                        type="button"
                                        className={`doctrine-timeline-node${isCurrent ? " doctrine-timeline-node--current" : ""}`}
                                        aria-current={isCurrent ? "true" : undefined}
                                        tabIndex={index === focusIndex ? 0 : -1}
                                        onClick={() => select(index)}
                                    >
                                        <span className="doctrine-timeline-node-dot" aria-hidden="true" />
                                        <span className="doctrine-timeline-node-name">{entry.figure.name}</span>
                                        <span className="doctrine-timeline-node-date">
                                            {getWorkDateLabel(entry.work)}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    <p className="doctrine-demonstration-note doctrine-timeline-notice">{DEMONSTRATION_NOTICE}</p>
                </>
            )}
        </nav>
    );
}
