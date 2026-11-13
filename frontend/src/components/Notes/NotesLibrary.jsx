import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Search, X } from "lucide-react";
import { formatNoteDate, getNoteReference } from "./notesUtils";
import NotesEmptyState from "./NotesEmptyState";
import { notePlainText } from "./noteRichText";
import "./Notes.css";

// Sliding Notes library. Overlays the editor from the left edge of the
// Notes panel and never resizes it (or Scripture): the panel clips it with
// overflow-hidden. On mobile it becomes a full-panel view. The editor stays
// mounted underneath, so opening or closing the drawer never loses editor
// state. Selecting a note closes the drawer and loads the note in the
// editor (handled by the panel).

function notePreview(note) {
    const firstLine = notePlainText(note.content || "")
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.length > 0);
    if (!firstLine) return "";
    return firstLine.length > 90
        ? `${firstLine.slice(0, 90)}…`
        : firstLine;
}

export default function NotesLibrary({
    open,
    onClose,
    onSelectNote,
    selectedNoteId,
    notes,
    books,
    isLoadingNotes,
    notesError,
    nextCursor,
    isLoadingMore,
    loadMore,
}) {
    const [query, setQuery] = useState("");
    const searchRef = useRef(null);

    // Focus the search box when the drawer opens.
    useEffect(() => {
        if (open) searchRef.current?.focus();
    }, [open ]);

    const visibleNotes = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return notes;
        return notes.filter((note) => {
            const reference = getNoteReference(note, books).toLowerCase();
            const title = (note.title || "").toLowerCase();
            return (
                title.includes(needle) ||
                reference.includes(needle) ||
                notePlainText(note.content || "").toLowerCase().includes(needle)
            );
        });
    }, [notes, books, query]);

    const handleKeyDown = (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            onClose();
        }
    };

    return (
        <div
            id="notes-library"
            role="dialog"
            aria-label="Notes library"
            aria-hidden={!open}
            data-open={open}
            onKeyDown={handleKeyDown}
            className="notes-library-drawer"
        >
            {/* Header: back on mobile, close on desktop */}
            <div
                className="
                    flex
                    shrink-0
                    items-center
                    gap-2
                    border-b
                    border-[var(--border)]
                    bg-[var(--bg-panel)]
                    px-3
                    py-2.5
                "
            >
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Back to editor"
                    className="
                        flex
                        h-8
                        w-8
                        items-center
                        justify-center
                        rounded-md
                        text-[var(--text-muted)]
                        transition
                        hover:bg-[var(--hover-bg)]
                        hover:text-[var(--text-primary)]
                        focus-visible:outline
                        focus-visible:outline-2
                        focus-visible:outline-[var(--color-accent)]
                        md:hidden
                    "
                >
                    <ChevronLeft size={18} aria-hidden="true" />
                </button>

                <h2
                    className="
                        flex-1
                        font-serif
                        text-base
                        font-semibold
                        text-[var(--text-primary)]
                    "
                >
                    Library
                </h2>

                <span
                    className="
                        text-[11px]
                        text-[var(--text-muted)]
                    "
                >
                    {notes.length} {notes.length === 1 ? "note" : "notes"}
                </span>

                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close library"
                    className="
                        hidden
                        h-8
                        w-8
                        items-center
                        justify-center
                        rounded-md
                        text-[var(--text-muted)]
                        transition
                        hover:bg-[var(--hover-bg)]
                        hover:text-[var(--text-primary)]
                        focus-visible:outline
                        focus-visible:outline-2
                        focus-visible:outline-[var(--color-accent)]
                        md:flex
                    "
                >
                    <X size={16} aria-hidden="true" />
                </button>
            </div>

            {/* Search */}
            <div className="shrink-0 px-3 py-3">
                <div
                    className="
                        flex
                        items-center
                        gap-2
                        rounded-lg
                        border
                        border-[var(--border)]
                        bg-[var(--bg-input)]
                        px-3
                    "
                >
                    <Search
                        size={15}
                        aria-hidden="true"
                        className="shrink-0 text-[var(--text-muted)]"
                    />
                    <input
                        ref={searchRef}
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search notes"
                        aria-label="Search notes"
                        // 16px text prevents iOS Safari from zooming on focus.
                        className="
                            h-9
                            w-full
                            min-w-0
                            bg-transparent
                            text-base
                            text-[var(--text-primary)]
                            outline-none
                            placeholder:text-[var(--text-muted)]
                            placeholder:opacity-60
                        "
                    />
                </div>
            </div>

            {/* Note list */}
            <div
                className="
                    min-h-0
                    flex-1
                    overflow-y-auto
                    overscroll-contain
                    px-2
                    pb-3
                "
            >
                {isLoadingNotes && (
                    <div className="py-12 text-center">
                        <div
                            className="
                                mx-auto
                                mb-4
                                h-7
                                w-7
                                animate-spin
                                rounded-full
                                border-2
                                border-[var(--border)]
                                border-t-[var(--color-accent)]
                            "
                        />
                        <p className="font-serif text-xs italic text-[var(--text-muted)]">
                            Gathering your reflections...
                        </p>
                    </div>
                )}

                {!isLoadingNotes && notesError && (
                    <p className="px-3 py-6 text-center text-xs leading-5 text-[var(--color-brand)]">
                        {notesError}
                    </p>
                )}

                {!isLoadingNotes && !notesError && notes.length === 0 && (
                    <div className="px-1">
                        <NotesEmptyState />
                    </div>
                )}

                {!isLoadingNotes &&
                    !notesError &&
                    notes.length > 0 &&
                    visibleNotes.length === 0 && (
                        <p className="px-3 py-6 text-center font-serif text-xs italic text-[var(--text-muted)]">
                            No notes match &ldquo;{query.trim()}&rdquo;.
                        </p>
                    )}

                {!isLoadingNotes &&
                    visibleNotes.map((note) => {
                        const selected = note.id === selectedNoteId;
                        const stamp =
                            note.updated_at &&
                            note.updated_at !== note.created_at
                                ? note.updated_at
                                : note.created_at;
                        return (
                            <button
                                key={note.id}
                                type="button"
                                onClick={() => onSelectNote(note)}
                                aria-current={selected ? "true" : undefined}
                                className={`
                                    mb-1
                                    block
                                    w-full
                                    rounded-lg
                                    border
                                    px-3
                                    py-2.5
                                    text-left
                                    transition
                                    focus-visible:outline
                                    focus-visible:outline-2
                                    focus-visible:outline-[var(--color-accent)]
                                    ${
                                        selected
                                            ? "border-[var(--color-accent)] bg-[var(--bg-selected)]"
                                            : "border-transparent hover:bg-[var(--hover-bg)]"
                                    }
                                `}
                            >
                                <span
                                    className="
                                        block
                                        truncate
                                        font-serif
                                        text-sm
                                        font-semibold
                                        text-[var(--color-brand)]
                                    "
                                >
                                    {note.title?.trim() || getNoteReference(note, books)}
                                </span>
                                <span
                                    className="
                                        mt-0.5
                                        block
                                        truncate
                                        text-xs
                                        leading-5
                                        text-[var(--text-primary)]
                                    "
                                >
                                    {notePreview(note)}
                                </span>
                                {stamp && (
                                    <span
                                        className="
                                            mt-1
                                            block
                                            text-[11px]
                                            text-[var(--text-muted)]
                                        "
                                    >
                                        {formatNoteDate(stamp)}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                {!query.trim() && nextCursor && (
                    <button type="button" onClick={loadMore} disabled={isLoadingMore}
                        className="mt-2 w-full rounded-lg px-3 py-2 text-xs font-medium text-[var(--color-brand)] hover:bg-[var(--hover-bg)] disabled:opacity-60">
                        {isLoadingMore ? "Loading…" : "Load more notes"}
                    </button>
                )}
            </div>
        </div>
    );
}
