export default function MobileStudyTabs({
    activeTab,
    setActiveTab
}) {
    return (
        <div
            className="
                fixed
                left-0
                right-0
                top-[108px]
                z-30

                hidden
                max-[768px]:grid
                grid-cols-2

                border-b
                border-[var(--border)]
                bg-[var(--bg-nav)]
            "
        >
            <button
                onClick={() =>
                    setActiveTab("scripture")
                }
                className={`
                    py-3
                    font-serif
                    text-xs
                    font-semibold
                    tracking-[0.08em]
                    transition-colors

                    ${
                        activeTab === "scripture"
                            ? "border-b-2 border-[var(--color-brand)] text-[var(--color-brand)]"
                            : "text-[var(--text-muted)]"
                    }
                `}
            >
                SCRIPTURE
            </button>

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
                    transition-colors

                    ${
                        activeTab === "commentary"
                            ? "border-b-2 border-[var(--color-brand)] text-[var(--color-brand)]"
                            : "text-[var(--text-muted)]"
                    }
                `}
            >
                COMMENTARY
            </button>
        </div>
    );
}