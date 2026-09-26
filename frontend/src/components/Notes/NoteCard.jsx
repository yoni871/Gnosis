import {
    formatNoteDate,
    getNoteReference
} from "./notesUtils";

export default function NoteCard({
    note,
    index,
    totalNotes,
    books,

    editingNoteId,
    editContent,
    setEditContent,

    isUpdatingNote,
    deletingNoteId,

    onStartEdit,
    onCancelEdit,
    onUpdate,
    onDelete
}) {
    const isEditing = editingNoteId === note.id;
    const isDeleting = deletingNoteId === note.id;

    return (
        <article
            className="
                relative
                mb-5
                overflow-hidden
                rounded-2xl
                border
                border-[var(--border)]
                bg-[var(--bg-selected)]
                shadow-sm
                transition-all
                duration-200
                hover:-translate-y-[2px]
                hover:shadow-md
            "
        >
            {/* Accent */}
            <div
                className="
                    absolute
                    bottom-0
                    left-0
                    top-0
                    w-[3px]
                    bg-[var(--color-accent)]
                    opacity-70
                "
            />

            {/* Header */}
            <div
                className="
                    flex
                    items-start
                    justify-between
                    gap-5
                    border-b
                    border-[var(--border)]
                    bg-[var(--bg-surface)]
                    px-6
                    py-4
                "
            >
                <div>
                    <p
                        className="
                            text-[8px]
                            font-bold
                            uppercase
                            tracking-[0.2em]
                            text-[var(--text-muted)]
                        "
                    >
                        Reflection {totalNotes - index}
                    </p>

                    <h3
                        className="
                            mt-1
                            font-serif
                            text-base
                            font-semibold
                            text-[var(--color-brand)]
                        "
                    >
                        {getNoteReference(note, books)}
                    </h3>
                </div>

                <div className="text-right">
                    {note.created_at && (
                        <p
                            className="
                                text-[9px]
                                tracking-wide
                                text-[var(--text-muted)]
                            "
                        >
                            {formatNoteDate(note.created_at)}
                        </p>
                    )}

                    <span
                        className="
                            mt-2
                            inline-block
                            text-[10px]
                            text-[var(--color-accent-text)]
                        "
                    >
                        ◆
                    </span>
                </div>
            </div>

            {/* Editing */}
            {isEditing ? (
                <div className="px-6 py-5">
                    <p
                        className="
                            mb-2
                            text-[9px]
                            font-bold
                            uppercase
                            tracking-[0.16em]
                            text-[var(--text-muted)]
                        "
                    >
                        Edit Reflection
                    </p>

                    <textarea
                        value={editContent}
                        onChange={(event) =>
                            setEditContent(event.target.value)
                        }
                        rows="7"
                        autoFocus
                        className="
                            w-full
                            resize-none
                            rounded-xl
                            border
                            border-[var(--border)]
                            bg-[var(--bg-input)]
                            px-4
                            py-4
                            font-serif
                            text-[14px]
                            leading-7
                            text-[var(--text-primary)]
                            outline-none
                            transition
                            focus:border-[var(--color-accent)]
                        "
                    />

                    <div
                        className="
                            mt-4
                            flex
                            justify-end
                            gap-2
                        "
                    >
                        <button
                            onClick={onCancelEdit}
                            disabled={isUpdatingNote}
                            className="
                                rounded-full
                                border
                                border-[var(--border)]
                                px-4
                                py-2
                                text-[10px]
                                font-semibold
                                text-[var(--text-muted)]
                                transition
                                hover:bg-[var(--hover-bg)]
                                disabled:opacity-40
                            "
                        >
                            Cancel
                        </button>

                        <button
                            onClick={() =>
                                onUpdate(note.id)
                            }
                            disabled={
                                isUpdatingNote ||
                                !editContent.trim()
                            }
                            className="
                                rounded-full
                                bg-[var(--color-brand)]
                                px-5
                                py-2
                                text-[10px]
                                font-semibold
                                text-white
                                transition
                                hover:bg-[var(--color-brand-dark)]
                                disabled:cursor-not-allowed
                                disabled:opacity-40
                            "
                        >
                            {isUpdatingNote
                                ? "Saving..."
                                : "Save Changes"
                            }
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {/* Note text */}
                    <div className="px-6 py-6">
                        <p
                            className="
                                whitespace-pre-wrap
                                font-serif
                                text-[15px]
                                leading-8
                                text-[var(--text-primary)]
                            "
                        >
                            {note.content}
                        </p>
                    </div>

                    {/* Footer */}
                    <footer
                        className="
                            flex
                            items-center
                            justify-between
                            gap-4
                            border-t
                            border-[var(--border)]
                            px-5
                            py-2.5
                        "
                    >
                        <p
                            className="
                                hidden
                                font-serif
                                text-[9px]
                                italic
                                text-[var(--text-muted)]
                                sm:block
                            "
                        >
                            {note.updated_at &&
                            note.updated_at !== note.created_at
                                ? "Edited"
                                : "Gnosis Journal"
                            }
                        </p>

                        <div
                            className="
                                ml-auto
                                flex
                                items-center
                                gap-1
                            "
                        >
                            <button
                                onClick={() =>
                                    onStartEdit(note)
                                }
                                disabled={isDeleting}
                                className="
                                    rounded-full
                                    px-3
                                    py-1.5
                                    text-[10px]
                                    font-semibold
                                    tracking-wide
                                    text-[var(--color-brand)]
                                    transition
                                    hover:bg-[var(--hover-bg)]
                                    disabled:opacity-40
                                "
                            >
                                Edit
                            </button>

                            <span
                                className="
                                    text-[var(--border)]
                                "
                            >
                                ·
                            </span>

                            <button
                                onClick={() =>
                                    onDelete(note.id)
                                }
                                disabled={isDeleting}
                                className="
                                    rounded-full
                                    px-3
                                    py-1.5
                                    text-[10px]
                                    font-semibold
                                    tracking-wide
                                    text-[var(--text-muted)]
                                    transition
                                    hover:bg-[var(--hover-bg)]
                                    hover:text-[var(--color-brand)]
                                    disabled:opacity-40
                                "
                            >
                                {isDeleting
                                    ? "Deleting..."
                                    : "Delete"
                                }
                            </button>
                        </div>
                    </footer>
                </>
            )}
        </article>
    );
}