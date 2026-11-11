// One tablist component with two layouts (plan §2.2, correction 1).
//
// On desktop it is a vertical sidebar rail inside the event panel
// (aria-orientation="vertical", ~180–200 px wide); on mobile it is a
// compact horizontal tab row (aria-orientation="horizontal"). One state,
// one ARIA pattern: role="tablist", each tab role="tab" + aria-selected +
// aria-controls, each panel role="tabpanel" + aria-labelledby. Keyboard:
// Up/Down + Home/End on desktop, Left/Right + Home/End on mobile, with
// roving tabindex (only the active tab is in the tab order).
import { useRef } from "react";
import { useHistoryIsMobile } from "./useHistoryIsMobile";
import { HISTORY_SECTIONS } from "../../utils/historyContent";

export default function HistoryEventNav({ sections = HISTORY_SECTIONS, activeId, onSelect }) {
    const isMobile = useHistoryIsMobile();
    const tabRefs = useRef([]);
    const activeIndex = Math.max(0, sections.findIndex((s) => s.id === activeId));

    const focusTab = (index) => {
        const tab = tabRefs.current[index];
        if (tab) tab.focus();
    };
    const selectTab = (index) => {
        const section = sections[index];
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
            selectTab((activeIndex - 1 + sections.length) % sections.length);
        } else if (event.key === nextKey) {
            event.preventDefault();
            selectTab((activeIndex + 1) % sections.length);
        } else if (event.key === "Home") {
            event.preventDefault();
            selectTab(0);
        } else if (event.key === "End") {
            event.preventDefault();
            selectTab(sections.length - 1);
        }
    };

    return (
        <div
            role="tablist"
            aria-orientation={isMobile ? "horizontal" : "vertical"}
            aria-label="Event sections"
            className={`history-event-nav${isMobile ? " history-event-nav--mobile" : " history-event-nav--desktop"}`}
            onKeyDown={onKeyDown}
        >
            {sections.map((section, index) => {
                const isActive = section.id === activeId;
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
                        {section.label}
                    </button>
                );
            })}
        </div>
    );
}
