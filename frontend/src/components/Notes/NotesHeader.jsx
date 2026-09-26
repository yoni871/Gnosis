export default function NotesHeader({ notesCount }) {
    return (
        <header className="mb-8">
            <div
                className="
                    flex
                    items-end
                    justify-between
                    gap-5
                "
            >
                <div>
                    <p
                        className="
                            text-[9px]
                            font-bold
                            uppercase
                            tracking-[0.3em]
                            text-[var(--color-accent-text)]
                        "
                    >
                        Gnosis Study Journal
                    </p>

                    <h1
                        className="
                            mt-2
                            font-serif
                            text-[30px]
                            font-semibold
                            leading-tight
                            text-[var(--text-primary)]
                        "
                    >
                        My Notes
                    </h1>

                    <p
                        className="
                            mt-2
                            max-w-md
                            font-serif
                            text-xs
                            italic
                            leading-5
                            text-[var(--text-muted)]
                        "
                    >
                        Preserve what you notice.
                        Return to what you learn.
                    </p>
                </div>

                <div
                    className="
                        hidden
                        shrink-0
                        sm:block
                    "
                >
                    <p
                        className="
                            text-right
                            font-serif
                            text-2xl
                            text-[var(--color-accent-text)]
                        "
                    >
                        {notesCount}
                    </p>

                    <p
                        className="
                            text-[9px]
                            font-semibold
                            uppercase
                            tracking-[0.16em]
                            text-[var(--text-muted)]
                        "
                    >
                        {notesCount === 1
                            ? "Entry"
                            : "Entries"
                        }
                    </p>
                </div>
            </div>

            <div
                className="
                    mt-6
                    flex
                    items-center
                    gap-3
                "
            >
                <div
                    className="
                        h-px
                        flex-1
                        bg-[var(--border)]
                    "
                />

                <span
                    className="
                        text-[10px]
                        text-[var(--color-accent-text)]
                    "
                >
                    ◆
                </span>

                <div
                    className="
                        h-px
                        w-12
                        bg-[var(--color-accent)]
                        opacity-60
                    "
                />
            </div>
        </header>
    );
}