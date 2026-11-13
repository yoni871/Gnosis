// The event study page.
//
// Desktop: a wide study workspace — a compact left rail (Story /
// Context / Connections, Sources pinned at the bottom), a spacious
// reading column, an optional Scripture companion beside the content,
// and a slim timeline along the bottom. Mobile (≤768px): the previously
// approved single-column design — a bottom sheet at 45dvh collapsed /
// 85dvh expanded (the OriginalLanguageModal pattern: createPortal,
// focus trap, Escape to close, focus return, drag handle,
// prefers-reduced-motion), horizontal section tabs, the timeline at the
// bottom, and the Scripture companion as an inline block inside the
// sheet instead of a side panel.
//
// The panel is a modal dialog on both layouts, so focus behaviour is
// the same everywhere. One section shows at a time, without reloading;
// opening or closing the Scripture companion never resets the active
// section. Sources is its own section: a footnote link in the prose
// switches to it and scrolls to the cited source.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, X } from "lucide-react";
import {
    eventSlug,
    formatScriptureRange,
    getBooksForEvent,
    getBookTitle,
    listEventsForBook,
    loadEventSections,
} from "../../services/historyService";
import HistoryAncientWorld from "./HistoryAncientWorld";
import HistoryConnectionChips from "./HistoryConnectionChips";
import HistoryDateLabel from "./HistoryDateLabel";
import HistoryEventNav from "./HistoryEventNav";
import HistoryOverview from "./HistoryOverview";
import HistoryScriptureCompanion from "./HistoryScriptureCompanion";
import HistoryScriptureTab from "./HistoryScriptureTab";
import HistorySourcesList from "./HistorySourcesList";
import HistoryTimeline from "./HistoryTimeline";
import { useHistoryIsMobile } from "./useHistoryIsMobile";
import { HISTORY_SECTIONS } from "../../utils/historyContent";
import "./History.css";

// Focusable selectors for the focus trap (same set as the OL modal).
const FOCUSABLE =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function HistoryEventPanel({ event, bookId, onClose }) {
    const [activeTab, setActiveTab] = useState("overview");
    const [sections, setSections] = useState(null);
    const [sectionsError, setSectionsError] = useState("");
    const [companionPassage, setCompanionPassage] = useState(null);
    const [isSheetExpanded, setIsSheetExpanded] = useState(false);
    const [sheetDragOffset, setSheetDragOffset] = useState(0);
    const sheetDragStartYRef = useRef(null);
    const sheetDidDragRef = useRef(false);
    const isMobile = useHistoryIsMobile();
    // The collapsed mobile sheet (45dvh) cannot fit the full header, so
    // the book note, cross-book chips, and timeline hint are hidden until
    // the sheet expands — otherwise the bottom-anchored timeline covers
    // the section tab row (D1).
    const isSheetCollapsed = isMobile && !isSheetExpanded;

    const dialogRef = useRef(null);
    const previouslyFocusedRef = useRef(null);
    const scriptureButtonRef = useRef(null);
    const companionPassageRef = useRef(null);
    const pendingFootnoteRef = useRef(null);

    const timelineEvents = listEventsForBook(bookId);
    const otherBooks = getBooksForEvent(event.id);
    const bookTitle = getBookTitle(bookId) ?? bookId;

    useEffect(() => {
        let cancelled = false;
        // Sections load asynchronously; the initial state (null sections,
        // "overview" tab) is already correct for a fresh mount — the
        // parent keys this panel by event id, so a new event remounts it.
        loadEventSections(event.id)
            .then((loaded) => {
                if (cancelled) return;
                if (!loaded) setSectionsError("The event text could not be loaded.");
                else setSections(loaded);
            })
            .catch(() => {
                if (!cancelled) setSectionsError("The event text could not be loaded.");
            });
        return () => {
            cancelled = true;
        };
    }, [event.id]);

    useEffect(() => {
        companionPassageRef.current = companionPassage;
    }, [companionPassage]);

    const openCompanion = useCallback((passage) => {
        if (passage) setCompanionPassage(passage);
    }, []);

    const closeCompanion = useCallback(() => {
        setCompanionPassage(null);
        scriptureButtonRef.current?.focus();
    }, []);

    // Dialog semantics: remember the opener, focus the dialog, trap Tab,
    // close on Escape, lock background scroll, restore focus on close.
    // Escape closes the Scripture companion first when it is open — the
    // panel itself only closes on Escape with no companion open.
    useEffect(() => {
        previouslyFocusedRef.current = document.activeElement;
        const dialog = dialogRef.current;
        const closeButton = dialog?.querySelector("[data-testid='history-panel-close']");
        closeButton?.focus();
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        function onKeyDown(keyboardEvent) {
            if (keyboardEvent.key === "Escape") {
                keyboardEvent.stopPropagation();
                if (companionPassageRef.current) {
                    closeCompanion();
                    return;
                }
                onClose();
                return;
            }
            if (keyboardEvent.key !== "Tab" || !dialog) return;
            const focusable = [...dialog.querySelectorAll(FOCUSABLE)]
                .filter((element) => element.offsetParent !== null);
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (keyboardEvent.shiftKey && document.activeElement === first) {
                keyboardEvent.preventDefault();
                last.focus();
            } else if (!keyboardEvent.shiftKey && document.activeElement === last) {
                keyboardEvent.preventDefault();
                first.focus();
            }
        }
        document.addEventListener("keydown", onKeyDown, true);
        return () => {
            document.removeEventListener("keydown", onKeyDown, true);
            document.body.style.overflow = previousOverflow;
            // Focus return (D2): the book page unmounts and remounts on
            // the close navigation, so the node captured on open is
            // detached by close time — focusing it is a no-op and focus
            // falls to BODY. Restore by the opener's stable id instead;
            // the remounted book page renders the same link. (A deep-link
            // open has no opener node, and the id lookup covers that too.)
            // Fall back to the captured node only if it is still mounted
            // (the no-route-change case, e.g. a state-toggled panel).
            //
            // Note: closing now navigates to the index book directory,
            // not the book page (the book URL redirects to the first
            // event), so the event link is not in the DOM after close
            // and neither the id lookup nor the captured node applies —
            // focus falls to BODY. That is the current behaviour; a
            // focus target on the index for panel-close returns is an
            // open follow-up, not part of this redirect.
            const opener = document.getElementById(`history-event-link-${eventSlug(event.id)}`);
            if (opener) {
                opener.focus();
            } else if (previouslyFocusedRef.current?.isConnected) {
                previouslyFocusedRef.current.focus();
            }
        };
        // event.id is stable for the panel's lifetime (the parent keys the
        // panel by event id), so the effect still runs once per mount.
        // closeCompanion is stable (refs + setState only).
    }, [onClose, event.id, closeCompanion]);

    // Mobile bottom sheet: the handle drags to expand/collapse/dismiss, and
    // a tap on it toggles expand/collapse. (Same pattern as the OL modal.)
    const handleSheetPointerDown = useCallback((pointerEvent) => {
        pointerEvent.currentTarget.setPointerCapture?.(pointerEvent.pointerId);
        sheetDragStartYRef.current = pointerEvent.clientY;
        sheetDidDragRef.current = false;
    }, []);
    const handleSheetPointerMove = useCallback((pointerEvent) => {
        if (sheetDragStartYRef.current === null) return;
        const delta = pointerEvent.clientY - sheetDragStartYRef.current;
        setSheetDragOffset(Math.max(-160, Math.min(320, delta)));
    }, []);
    const handleSheetPointerUp = useCallback((pointerEvent) => {
        if (sheetDragStartYRef.current === null) return;
        const delta = pointerEvent.clientY - sheetDragStartYRef.current;
        sheetDragStartYRef.current = null;
        setSheetDragOffset(0);
        if (Math.abs(delta) < 10) return; // A tap is the click handler's job.
        sheetDidDragRef.current = true;
        if (delta < -60) {
            setIsSheetExpanded(true);
        } else if (delta > 60) {
            if (isSheetExpanded) setIsSheetExpanded(false);
            else onClose();
        }
    }, [isSheetExpanded, onClose]);
    const handleSheetPointerCancel = useCallback(() => {
        sheetDragStartYRef.current = null;
        setSheetDragOffset(0);
    }, []);
    const handleSheetClick = useCallback(() => {
        if (sheetDidDragRef.current) {
            sheetDidDragRef.current = false;
            return;
        }
        setIsSheetExpanded((expanded) => !expanded);
    }, []);

    // Sources is its own section, so a footnote link in the prose has no
    // sources list to land on while another section is showing. Intercept
    // it: switch to Sources, then scroll to the cited source once the
    // list renders.
    const handleContentClick = useCallback((clickEvent) => {
        const link = clickEvent.target.closest?.("a.history-footnote-link");
        if (!link) return;
        const href = link.getAttribute("href");
        if (!href || !href.startsWith("#source-")) return;
        clickEvent.preventDefault();
        pendingFootnoteRef.current = href.slice(1);
        setActiveTab("sources");
    }, []);

    useEffect(() => {
        if (activeTab !== "sources" || !pendingFootnoteRef.current) return;
        const id = pendingFootnoteRef.current;
        pendingFootnoteRef.current = null;
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        // jsdom (tests) has no scrollIntoView; guard the call.
        document.getElementById(id)?.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
    }, [activeTab, sections]);

    const activeSection = HISTORY_SECTIONS.find((section) => section.id === activeTab) ?? HISTORY_SECTIONS[0];

    return createPortal(
        <div
            className="history-panel-backdrop"
            onMouseDown={(mouseEvent) => {
                if (mouseEvent.target === mouseEvent.currentTarget) onClose();
            }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={event.title}
                className={`history-panel-dialog history-study${isSheetCollapsed ? " history-panel-dialog--collapsed" : ""}`}
                style={{
                    "--history-sheet-height": isSheetExpanded ? "85dvh" : "45dvh",
                    transform: sheetDragOffset !== 0 ? `translateY(${sheetDragOffset}px)` : undefined,
                }}
            >
                <button
                    type="button"
                    className="history-sheet-handle"
                    data-testid="history-sheet-handle"
                    aria-expanded={isSheetExpanded}
                    aria-label={isSheetExpanded ? "Collapse event panel" : "Expand event panel"}
                    onClick={handleSheetClick}
                    onPointerDown={handleSheetPointerDown}
                    onPointerMove={handleSheetPointerMove}
                    onPointerUp={handleSheetPointerUp}
                    onPointerCancel={handleSheetPointerCancel}
                >
                    <span className="history-sheet-handle-pill" aria-hidden="true" />
                </button>
                <header className="history-panel-header">
                    <div className="history-study-heading">
                        <p className="history-panel-eyebrow">
                            {bookTitle} · Biblical History
                        </p>
                        <h2 className="history-panel-title">{event.title}</h2>
                        <p className="history-panel-meta">
                            {formatScriptureRange(event.primaryScripture)}
                            {" · "}
                            <HistoryDateLabel date={event.date} />
                        </p>
                        {event.status !== "published" && (
                            <p className="history-dev-badge" role="note">
                                {event.status === "draft"
                                    ? "Development content — not researched editorial content"
                                    : event.status === "in-review"
                                        ? "In review — unpublished editorial content"
                                        : "Verified — unpublished editorial content"}
                            </p>
                        )}
                        {event.bookNote && (
                            <p className="history-panel-book-note">{event.bookNote}</p>
                        )}
                    </div>
                    <div className="history-study-actions">
                        <button
                            type="button"
                            ref={scriptureButtonRef}
                            data-testid="history-scripture-button"
                            className="history-scripture-button"
                            aria-expanded={Boolean(companionPassage)}
                            aria-controls="history-scripture-companion"
                            disabled={!event.primaryScripture}
                            onClick={() => {
                                if (companionPassage) closeCompanion();
                                else openCompanion(event.primaryScripture);
                            }}
                        >
                            <BookOpen size={15} aria-hidden="true" />
                            <span>Scripture</span>
                        </button>
                        <button
                            type="button"
                            data-testid="history-panel-close"
                            aria-label="Close event details"
                            className="history-panel-close"
                            onClick={onClose}
                        >
                            <X size={20} aria-hidden="true" />
                        </button>
                    </div>
                </header>

                <HistoryConnectionChips event={event} books={otherBooks} currentBookId={bookId} />

                <div className="history-study-body">
                    <HistoryEventNav activeId={activeTab} onSelect={setActiveTab} />
                    <div className="history-study-content" onClick={handleContentClick}>
                        {sectionsError && (
                            <p className="history-panel-status" role="alert">{sectionsError}</p>
                        )}
                        {!sections && !sectionsError && (
                            <p className="history-panel-status" role="status">Loading…</p>
                        )}
                        {sections && (
                            <div
                                role="tabpanel"
                                id={`history-section-${activeSection.id}`}
                                aria-labelledby={`history-tab-${activeSection.id}`}
                            >
                                {activeTab === "overview" && (
                                    <HistoryOverview sections={sections} />
                                )}
                                {activeTab === "ancient-world" && (
                                    <HistoryAncientWorld subsections={sections.ancientWorldSubsections} />
                                )}
                                {activeTab === "scripture" && (
                                    <HistoryScriptureTab event={event} onOpenPassage={openCompanion} />
                                )}
                                {activeTab === "sources" && (
                                    <HistorySourcesList sourceIds={event.sources ?? []} />
                                )}
                            </div>
                        )}
                        {isMobile && companionPassage && (
                            <HistoryScriptureCompanion
                                key={formatScriptureRange(companionPassage)}
                                passage={companionPassage}
                                onClose={closeCompanion}
                            />
                        )}
                    </div>
                    {!isMobile && companionPassage && (
                        <HistoryScriptureCompanion
                            key={formatScriptureRange(companionPassage)}
                            passage={companionPassage}
                            onClose={closeCompanion}
                        />
                    )}
                </div>

                <HistoryTimeline
                    events={timelineEvents}
                    currentEventId={event.id}
                    bookId={bookId}
                />
            </div>
        </div>,
        document.body,
    );
}
