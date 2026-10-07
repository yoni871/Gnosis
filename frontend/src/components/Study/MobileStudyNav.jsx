import { NotebookPen, Bookmark, Highlighter } from "lucide-react";

export default function MobileStudyNav({
    activeTab,
    setActiveTab
}) {
    return (
        <nav
            className="
                fixed
                bottom-0
                left-0
                right-0
                z-40

                hidden
                max-[768px]:grid
                grid-cols-3

                border-t
                border-[var(--border)]
                bg-[var(--bg-nav)]
            "
        >
            <button
                aria-label="Notes"
                title="Notes"
                onClick={() =>
                    setActiveTab("notes")
                }
                className={`
                    flex items-center justify-center
                    py-3
                    font-serif
                    text-[11px]
                    font-semibold
                    tracking-[0.06em]
                    transition-colors

                    ${
                        activeTab === "notes"
                            ? "text-[var(--color-brand)]"
                            : "text-[var(--text-muted)]"
                    }
                `}
            >
                <NotebookPen size={20} aria-hidden="true"/>
            </button>

            <button
                aria-label="Bookmarks"
                title="Bookmarks"
                onClick={() => setActiveTab("bookmarks")}
                className="
                    flex items-center justify-center
                    cursor-pointer
                    py-3
                    font-serif
                    text-[11px]
                    font-semibold
                    tracking-[0.06em]
                    transition-colors
                "
            >
                <Bookmark size={20} aria-hidden="true" />
            </button>

            <button
                disabled
                aria-label="Highlights"
                title="Highlights"
                className="
                    flex items-center justify-center
                    cursor-not-allowed
                    py-3
                    font-serif
                    text-[11px]
                    font-semibold
                    tracking-[0.06em]
                    text-[var(--text-muted)]
                    opacity-50
                "
            >
                <Highlighter size={20} aria-hidden="true" />
            </button>
        </nav>
    );
}