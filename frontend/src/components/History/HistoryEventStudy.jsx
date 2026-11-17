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
    buildBookTimeline,
    formatScriptureRange,
    getBooksForCategory,
    getBooksForEvent,
    getBookTitle,
    loadCategorySections,
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

export default function HistoryEventStudy({ record, bookId, onBackToBooks }) {
    const isCategory = record.kind === "category";
    const [activeTab, setActiveTab] = useState("overview");
    const [sections, setSections] = useState(null);
    const [sectionsError, setSectionsError] = useState("");
    // The companion opens by default with the record's primary passage
    // (Creation: Genesis 1:1–2:3), so the reader meets the Scripture
    // beside the Story without a click — and only that passage, never
    // a whole chapter. A category's fullRange is NEVER the companion
    // passage: it can span dozens of chapters, and the companion fetches
    // every chapter in the passage it receives. The companion default is
    // always primaryScripture (≤3 chapters); switching happens through
    // openCompanion (the Connections tab), as before. The schema defines
    // no per-subsection passage for standalone categories (there are no
    // constituent events), so there is no sub-section passage for the
    // companion to follow.
    const [companionPassage, setCompanionPassage] = useState(record.primaryScripture ?? null);
    const [companionAutoOpened, setCompanionAutoOpened] = useState(Boolean(record.primaryScripture));
    const isMobile = useHistoryIsMobile();

    const scriptureButtonRef = useRef(null);
    const companionPassageRef = useRef(null);
    const pendingFootnoteRef = useRef(null);

    const timelineEntries = buildBookTimeline(bookId);
    const otherBooks = isCategory ? getBooksForCategory(record.id) : getBooksForEvent(record.id);
    const bookTitle = getBookTitle(bookId) ?? bookId;

    useEffect(() => {
        let cancelled = false;
        // Sections load asynchronously; the initial state (null sections,
        // "overview" tab) is already correct for a fresh mount — the
        // parent keys this study by record id, so a new record remounts
        // it. Events load their prose with loadEventSections, categories
        // with loadCategorySections.
        const loadSections = isCategory ? loadCategorySections : loadEventSections;
        const loadError = isCategory
            ? "The category text could not be loaded."
            : "The event text could not be loaded.";
        loadSections(record.id)
            .then((loaded) => {
                if (cancelled) return;
                if (!loaded) setSectionsError(loadError);
                else setSections(loaded);
            })
            .catch(() => {
                if (!cancelled) setSectionsError(loadError);
            });
        return () => {
            cancelled = true;
        };
    }, [record.id, isCategory]);

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
                    <h1 id="history-study-title" className="history-study-title">{record.title}</h1>
                    <p className="history-study-meta">
                        {formatScriptureRange(record.primaryScripture)}
                        {" · "}
                        <HistoryDateLabel date={record.date} />
                    </p>
                    {record.status !== "published" && (
                        <p className="history-dev-badge" role="note">
                            {record.status === "draft"
                                ? "Development content — not researched editorial content"
                                : record.status === "in-review"
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
                        disabled={!record.primaryScripture}
                        onClick={() => {
                            if (companionPassage) closeCompanion();
                            else openCompanion(record.primaryScripture);
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

            <HistoryConnectionChips event={record} books={otherBooks} currentBookId={bookId} />

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
                                <HistoryOverview sections={sections} event={record} />
                            )}
                            {activeTab === "ancient-world" && (
                                <HistoryAncientWorld subsections={sections.ancientWorldSubsections} />
                            )}
                            {activeTab === "scripture" && (
                                <HistoryScriptureTab event={record} onOpenPassage={openCompanion} />
                            )}
                            {activeTab === "sources" && (
                                <HistorySourcesList sourceIds={record.sources ?? []} />
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
                entries={timelineEntries}
                currentEntryId={record.id}
                bookId={bookId}
            />
        </section>
    );
}
