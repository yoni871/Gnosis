export default function NotesEmptyState() {
    return (
        <div
            className="
                relative
                overflow-hidden
                rounded-2xl
                border
                border-dashed
                border-[var(--border)]
                px-7
                py-12
                text-center
            "
        >
            <div
                className="
                    absolute
                    left-1/2
                    top-0
                    h-px
                    w-24
                    -translate-x-1/2
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
                A blank page
            </h3>

            <p
                className="
                    mx-auto
                    mt-2
                    max-w-xs
                    font-serif
                    text-xs
                    italic
                    leading-6
                    text-[var(--text-muted)]
                "
            >
                Your observations and reflections
                will gather here as you study.
            </p>
        </div>
    );
}