import { Library, Plus } from "lucide-react";

// Compact Notes header: library toggle, title, and New Note control.
// The library button reports its expanded state and controls the drawer;
// the panel returns focus to it when the drawer closes.
export default function NotesHeader({
    libraryButtonRef,
    libraryOpen,
    onToggleLibrary,
    onNewNote,
    notesCount,
}) {
    return (
        <header
            className="
                flex
                h-12
                shrink-0
                items-center
                gap-1
                border-b
                border-[var(--border)]
                bg-[var(--bg-panel)]
                px-2
            "
        >
            <button
                ref={libraryButtonRef}
                type="button"
                onClick={onToggleLibrary}
                aria-expanded={libraryOpen}
                aria-controls="notes-library"
                className="
                    flex
                    h-9
                    shrink-0
                    items-center
                    gap-1.5
                    rounded-md
                    px-2.5
                    text-[13px]
                    font-semibold
                    text-[var(--text-primary)]
                    transition
                    hover:bg-[var(--hover-bg)]
                    focus-visible:outline
                    focus-visible:outline-2
                    focus-visible:outline-[var(--color-accent)]
                "
            >
                <Library size={16} aria-hidden="true" />
                Library
            </button>

            <h2
                className="
                    min-w-0
                    flex-1
                    truncate
                    px-1
                    text-center
                    font-serif
                    text-[15px]
                    font-semibold
                    text-[var(--text-primary)]
                "
            >
                Notes
                {notesCount > 0 && (
                    <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                        {notesCount}
                    </span>
                )}
            </h2>

            <button
                type="button"
                onClick={onNewNote}
                className="
                    flex
                    h-9
                    shrink-0
                    items-center
                    gap-1.5
                    rounded-md
                    bg-[var(--color-brand)]
                    px-3
                    text-[13px]
                    font-semibold
                    text-white
                    shadow-sm
                    transition
                    hover:bg-[var(--color-brand-dark)]
                    focus-visible:outline
                    focus-visible:outline-2
                    focus-visible:outline-[var(--color-accent)]
                "
            >
                <Plus size={16} aria-hidden="true" />
                <span className="hidden min-[420px]:inline">New Note</span>
                <span className="sr-only min-[420px]:hidden">New note</span>
            </button>
        </header>
    );
}
