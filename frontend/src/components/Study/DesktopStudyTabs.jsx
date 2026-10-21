import { NotebookPen, Bookmark, Highlighter } from "lucide-react";

export default function DesktopStudyTabs({
    activeTab,
    setActiveTab
}) {
    return (
        <div
            className="
                grid
                shrink-0
                grid-cols-2
                border-b
                border-[var(--border)]
                bg-[var(--bg-nav)]
            "
        >
            <button
                onClick={() =>
                    setActiveTab("commentary")
                }
                className={`
                    py-3
                    font-serif
                    text-xs
                    font-semibold
                    tracking-[0.08em]
                    ${
                        activeTab === "commentary"
                            ? "border-b-2 border-[var(--color-brand)] text-[var(--color-brand)]"
                            : "text-[var(--text-muted)]"
                    }
                `}
            >
                COMMENTARY
            </button>

            <div className="flex items-stretch">
                <button
                    type="button"
                    aria-label="Notes"
                    title="Notes"
                    onClick={() =>
                        setActiveTab("notes")
                    }
                    className={`
                        flex flex-1 item-center justify-center
                        py-3
                        font-serif
                        text-xs
                        font-semibold
                        tracking-[0.08em]
                        ${
                            activeTab === "notes"
                                ? "border-b-2 border-[var(--color-brand)] text-[var(--color-brand)]"
                                : "text-[var(--text-muted)]"
                        }
                    `}
                >
                    <NotebookPen size={18} aria-hidden="true"/>
                </button>

                {/* Open the saved-bookmarks panel. */}
                <button
                    type="button"
                    aria-label="Bookmarks"
                    title="Bookmarks"
                    onClick={() => setActiveTab("bookmarks")}
                    className={`
                        flex flex-1 items-center justify-center
                        py-3
                        ${
                            activeTab === "bookmarks"
                                ? "border-b-2 border-[var(--color-brand)] text-[var(--color-brand)]"
                                : "text-[var(--text-muted)]"
                        }
                    `}
                >
                    <Bookmark size={18} aria-hidden="true" />
                </button>

                {/* Open the Highlights panel using its matching tab name. */}
                <button
                    type="button"
                    aria-label="Highlights"
                    title="Highlights"
                    onClick={() => setActiveTab("highlights")}
                    className={`
                        flex flex-1 items-center justify-center
                        py-3
                        ${
                            activeTab === "highlights"
                                ? "border-b-2 border-[var(--color-brand)] text-[var(--color-brand)]"
                                : "text-[var(--text-muted)]"
                        }
                    `}
                >
                    <Highlighter size={18} aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}