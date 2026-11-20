// One tablist component with two layouts (plan §2.2, correction 1;
// redesigned 2026-11-12 as a compact ~100px study rail).
//
// On desktop it is a narrow vertical rail beside the study content
// (aria-orientation="vertical"): a small icon above a compact label per
// section, with Sources pinned to the very bottom, separated from the
// other sections. On mobile it is a compact horizontal tab row
// (aria-orientation="horizontal") with text labels only. One state, one
// ARIA pattern: role="tablist", each tab role="tab" + aria-selected +
// aria-controls, each panel role="tabpanel" + aria-labelledby. Keyboard:
// Up/Down + Home/End on desktop, Left/Right + Home/End on mobile, with
// roving tabindex (only the active tab is in the tab order).
import { useRef } from "react";
import { BookMarked, BookOpen, Landmark, Library } from "lucide-react";
import { useHistoryIsMobile } from "./useHistoryIsMobile";
import { HISTORY_SECTIONS } from "../../utils/historyContent";

const SECTION_ICONS = {
    overview: BookOpen,
    "ancient-world": Landmark,
    scripture: BookMarked,
    sources: Library,
};

export default function HistoryEventNav({ sections = HISTORY_SECTIONS, activeId, onSelect }) {
    const isMobile = useHistoryIsMobile();
    const tabRefs = useRef([]);
    // Sources sits apart from the other sections on the desktop rail
    // (pinned to the bottom); on mobile it is simply the last tab in
    // the row. Either way the keyboard order is the section order.
    const mainSections = sections.filter((section) => section.id !== "sources");
    const sourcesSection = sections.find((section) => section.id === "sources");
    const ordered = sourcesSection ? [...mainSections, sourcesSection] : mainSections;
    const activeIndex = Math.max(0, ordered.findIndex((s) => s.id === activeId));

    const focusTab = (index) => {
        const tab = tabRefs.current[index];
        if (tab) tab.focus();
    };
    const selectTab = (index) => {
        const section = ordered[index];
        if (!section) return;
        onSelect(section.id);
        focusTab(index);
    };

    const onKeyDown = (event) => {
        const vertical = !isMobile;
        const prevKey = vertical ? "ArrowUp" : "ArrowLeft";
        const nextKey = vertical ? "ArrowDown" : "ArrowRight";
        if (event.key === prevKey) {
            event.preventDefault();
            selectTab((activeIndex - 1 + ordered.length) % ordered.length);
        } else if (event.key === nextKey) {
            event.preventDefault();
            selectTab((activeIndex + 1) % ordered.length);
        } else if (event.key === "Home") {
            event.preventDefault();
            selectTab(0);
        } else if (event.key === "End") {
            event.preventDefault();
            selectTab(ordered.length - 1);
        }
    };

    const renderTab = (section, index) => {
        const isActive = section.id === activeId;
        const Icon = SECTION_ICONS[section.id];
        return (
            <button
                key={section.id}
                ref={(element) => {
                    tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`history-tab-${section.id}`}
                aria-selected={isActive}
                aria-controls={`history-section-${section.id}`}
                tabIndex={isActive ? 0 : -1}
                className={`history-event-nav-tab${isActive ? " history-event-nav-tab--active" : ""}`}
                onClick={() => onSelect(section.id)}
            >
                {Icon && (
                    <span className="history-event-nav-icon" aria-hidden="true">
                        <Icon size={18} />
                    </span>
                )}
                <span className="history-event-nav-label">{section.label}</span>
            </button>
        );
    };

    return (
        <div
            role="tablist"
            aria-orientation={isMobile ? "horizontal" : "vertical"}
            aria-label="Event sections"
            className={`history-event-nav${isMobile ? " history-event-nav--mobile" : " history-event-nav--desktop"}`}
            onKeyDown={onKeyDown}
        >
            <div className="history-event-nav-main">
                {mainSections.map((section) => renderTab(section, ordered.indexOf(section)))}
            </div>
            {sourcesSection && (
                <div className="history-event-nav-sources">
                    {renderTab(sourcesSection, ordered.indexOf(sourcesSection))}
                </div>
            )}
        </div>
    );
}
