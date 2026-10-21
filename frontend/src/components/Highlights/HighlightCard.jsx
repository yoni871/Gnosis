import { NotebookPen, Trash2 } from "lucide-react";

// Display one highlighted verse with separate open and remove actions.
export default function HighlightCard({
    highlight,
    bookName,
    text,
    translation,
    isPreviewLoading,
    previewError,
    isBusy,
    onOpen,
    onRemove,
    onAddNote
}) {
    const reference =
        `${bookName} ${highlight.chapter}:${highlight.verse}`;

    return (
        <li className="flex items-start gap-2 border-b border-[var(--border)] py-4">
            {/* Make the verse preview clickable without nesting another button. */}
            <button
                type="button"
                onClick={onOpen}
                className="
                    block min-w-0 flex-1 cursor-pointer
                    rounded-lg p-3 text-left
                    hover:bg-[var(--bg-control-hover)]
                    focus-visible:outline-2
                    focus-visible:outline-[var(--color-brand)]
                    focus-visible:outline-offset-2
                "
            >
                <span className="flex items-center gap-2">
                    {/* Show the saved color independently of the selected translation. */}
                    <span
                        aria-hidden="true"
                        style={{ backgroundColor: highlight.color }}
                        className="h-3 w-3 shrink-0 rounded-full border border-[var(--border)]"
                    />

                    <span className="font-serif text-[15px] font-semibold text-[var(--color-brand)]">
                        {reference}
                    </span>
                </span>

                {/* The parent supplies Scripture text and preview status. */}
                <span className="mt-2 block font-serif text-[14px] leading-relaxed text-[var(--text-primary)]">
                    {isPreviewLoading
                        ? "Loading Scripture…"
                        : previewError
                            ? "Unable to load Scripture."
                            : text || "No Scripture text is available."}
                </span>

                <span className="mt-2 block text-[10px] font-semibold text-[var(--text-muted)]">
                    {translation}
                </span>
            </button>

            {/* Request a note without navigating or removing the highlight. */}
            <button
                type="button"
                aria-label={`Add note for ${reference}`}
                title="Add note"
                disabled={isBusy}
                onClick={onAddNote}
                className="
                    mt-3 flex h-9 w-9 shrink-0
                    cursor-pointer items-center justify-center rounded-md
                    text-[var(--text-muted)]
                    hover:bg-[var(--bg-control-hover)]
                    hover:text-[var(--color-brand)]
                    focus-visible:outline-2
                    focus-visible:outline-[var(--color-brand)]
                    disabled:cursor-wait disabled:opacity-50
                "
            >
                <NotebookPen size={16} aria-hidden="true" />
            </button>

            {/* Removing a highlight must not navigate to its passage. */}
            <button
                type="button"
                aria-label={`Remove highlight for ${reference}`}
                title="Remove highlight"
                disabled={isBusy}
                onClick={onRemove}
                className="
                    mt-3 flex h-9 w-9 shrink-0
                    cursor-pointer items-center justify-center rounded-md
                    text-[var(--text-muted)]
                    hover:bg-[var(--bg-control-hover)]
                    hover:text-[var(--color-brand)]
                    focus-visible:outline-2
                    focus-visible:outline-[var(--color-brand)]
                    disabled:cursor-wait disabled:opacity-50
                "
            >
                <Trash2 size={16} aria-hidden="true" />
            </button>
        </li>
    );
}