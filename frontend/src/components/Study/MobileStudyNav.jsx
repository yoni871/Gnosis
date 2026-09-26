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
                onClick={() =>
                    setActiveTab("notes")
                }
                className={`
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
                NOTES
            </button>

            <button
                disabled
                className="
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
                BOOKMARKS
            </button>

            <button
                disabled
                className="
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
                HIGHLIGHTS
            </button>
        </nav>
    );
}