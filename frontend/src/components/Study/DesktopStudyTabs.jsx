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

            <button
                onClick={() =>
                    setActiveTab("notes")
                }
                className={`
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
                NOTES
            </button>
        </div>
    );
}