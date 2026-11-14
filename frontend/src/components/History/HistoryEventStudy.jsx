// The event study page's workspace — a standalone page section, not a
// modal dialog.
//
// Desktop: a wide study workspace — a compact left rail (Story /
// Context / Connections, Sources pinned at the bottom), a spacious
// reading column, a Scripture companion beside the content (open by
// default with the event's primary passage, closable and reopenable),
// and the timeline at the bottom of the page. Mobile (≤768px): the
// same content in a single scrolling column — horizontal section tabs,
// the timeline at the bottom, and the Scripture companion as an inline
// block inside the reading column.
//
// This is ordinary page content in the document flow: no portal, no
// backdrop, no dialog semantics, no focus trap, no scroll lock, no
// bottom sheet. On desktop the study shares 100dvh with the header and
// timeline and the reading column and companion scroll independently;
// on mobile the page scrolls as a page. Escape closes the
// Scripture companion when it is open and otherwise does nothing —
// there is no modal to close, and browser Back is the way back.
// The close button returns to the Biblical History homepage's book
// directory (see BiblicalHistoryEventPage). One section shows at a
// time, without reloading; opening or closing the Scripture companion
// never resets the active section. Sources is its own section: a
// footnote link in the prose switches to it and scrolls to the cited
// source.
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, X } from "lucide-react";
import {
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

export default function HistoryEventStudy({ event, bookId, onBackToBooks }) {
    const [activeTab, setActiveTab] = useState("overview");
    const [sections, setSections] = useState(null);
    const [sectionsError, setSectionsError] = useState("");
    // The companion opens by default with the event's primary passage
    // (Creation: Genesis 1:1–2:3), so the reader meets the Scripture
    // beside the Story without a click — and only that passage, never
    // a whole chapter. companionAutoOpened tracks whether the current
    // open is that initial default: the companion must not steal focus
    // from the page on mount, but a companion the user opens (or
    // reopens) focuses its close control as before.
    const [companionPassage, setCompanionPassage] = useState(event.primaryScripture ?? null);
    const [companionAutoOpened, setCompanionAutoOpened] = useState(Boolean(event.primaryScripture));
    const isMobile = useHistoryIsMobile();

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
        // parent keys this study by event id, so a new event remounts it.
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
        setCompanionAutoOpened(false);
        scriptureButtonRef.current?.focus();
    }, []);

    // Escape closes the Scripture companion when it is open — nothing
    // else. There is no dialog to dismiss and no navigation to perform:
    // leaving the page is the browser's Back button or the close
    // button's return to the book directory.
    useEffect(() => {
        function onKeyDown(keyboardEvent) {
            if (keyboardEvent.key !== "Escape") return;
            if (!companionPassageRef.current) return;
            keyboardEvent.stopPropagation();
            closeCompanion();
        }
        document.addEventListener("keydown", onKeyDown, true);
        return () => {
            document.removeEventListener("keydown", onKeyDown, true);
        };
    }, [closeCompanion]);

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

    return (
        <section className="history-study" aria-labelledby="history-study-title">
            <header className="history-study-header">
                <div className="history-study-heading">
                    <p className="history-study-eyebrow">
                        {bookTitle} · Biblical History
                    </p>
                    <h1 id="history-study-title" className="history-study-title">{event.title}</h1>
                    <p className="history-study-meta">
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
                        data-testid="history-study-close"
                        aria-label="Back to Biblical History"
                        className="history-study-close"
                        onClick={onBackToBooks}
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
                        <p className="history-study-status" role="alert">{sectionsError}</p>
                    )}
                    {!sections && !sectionsError && (
                        <p className="history-study-status" role="status">Loading…</p>
                    )}
                    {sections && (
                        <div
                            role="tabpanel"
                            id={`history-section-${activeSection.id}`}
                            aria-labelledby={`history-tab-${activeSection.id}`}
                        >
                            {activeTab === "overview" && (
                                <HistoryOverview sections={sections} event={event} />
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
                            focusCloseOnOpen={!companionAutoOpened}
                        />
                    )}
                </div>
                {!isMobile && companionPassage && (
                    <HistoryScriptureCompanion
                        key={formatScriptureRange(companionPassage)}
                        passage={companionPassage}
                        onClose={closeCompanion}
                        focusCloseOnOpen={!companionAutoOpened}
                    />
                )}
            </div>

            <HistoryTimeline
                events={timelineEvents}
                currentEventId={event.id}
                bookId={bookId}
            />
        </section>
    );
}
