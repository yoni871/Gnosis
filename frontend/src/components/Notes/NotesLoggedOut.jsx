export default function NotesLoggedOut() {
    return (
        <section
            className="
                h-full
                overflow-y-auto
                bg-[var(--bg-panel)]
                px-5
                py-8
                sm:px-8
            "
        >
            <div className="mx-auto max-w-2xl">

                <div className="text-center">
                    <p
                        className="
                            text-[10px]
                            font-semibold
                            uppercase
                            tracking-[0.28em]
                            text-[var(--color-accent-text)]
                        "
                    >
                        Gnosis Journal
                    </p>

                    <h2
                        className="
                            mt-3
                            font-serif
                            text-3xl
                            font-semibold
                            text-[var(--text-primary)]
                        "
                    >
                        Notes
                    </h2>

                    <div
                        className="
                            mx-auto
                            mt-4
                            h-px
                            w-16
                            bg-[var(--color-accent)]
                            opacity-60
                        "
                    />

                    <p
                        className="
                            mx-auto
                            mt-5
                            max-w-md
                            font-serif
                            text-sm
                            leading-7
                            text-[var(--text-muted)]
                        "
                    >
                        A quiet place for observations,
                        questions, prayers, and reflections
                        from your study of Scripture.
                    </p>
                </div>

                <div
                    className="
                        relative
                        mt-10
                        overflow-hidden
                        rounded-2xl
                        border
                        border-[var(--border)]
                        bg-[var(--bg-selected)]
                        px-7
                        py-10
                        text-center
                        shadow-sm
                    "
                >
                    <div
                        className="
                            absolute
                            left-0
                            top-0
                            h-full
                            w-1
                            bg-[var(--color-accent)]
                            opacity-60
                        "
                    />

                    <div
                        className="
                            mx-auto
                            mb-5
                            flex
                            h-12
                            w-12
                            items-center
                            justify-center
                            rounded-full
                            border
                            border-[var(--border)]
                            bg-[var(--bg-surface)]
                            font-serif
                            text-xl
                            text-[var(--color-accent-text)]
                        "
                    >
                        ✦
                    </div>

                    <h3
                        className="
                            font-serif
                            text-lg
                            font-semibold
                            text-[var(--text-primary)]
                        "
                    >
                        Your personal study journal
                    </h3>

                    <p
                        className="
                            mx-auto
                            mt-3
                            max-w-sm
                            text-sm
                            leading-6
                            text-[var(--text-muted)]
                        "
                    >
                        Sign in to save reflections and
                        keep them connected to the passages
                        you're studying.
                    </p>
                </div>

            </div>
        </section>
    );
}