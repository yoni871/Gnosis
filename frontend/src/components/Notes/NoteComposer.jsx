export default function NoteComposer({
    book,
    chapter,
    selectedVerse,
    noteContent,
    setNoteContent,
    isSavingNote,
    onSave
}) {
    return (
        <>
            {/* Selected passage */}
            <div className="mb-5">
                <div
                    className="
                        flex
                        items-center
                        gap-2
                    "
                >
                    <span
                        className="
                            h-1.5
                            w-1.5
                            rounded-full
                            bg-[var(--color-accent)]
                        "
                    />

                    <p
                        className="
                            text-[9px]
                            font-bold
                            uppercase
                            tracking-[0.2em]
                            text-[var(--text-muted)]
                        "
                    >
                        Selected Passage
                    </p>
                </div>

                {selectedVerse ? (
                    <p
                        className="
                            mt-2
                            font-serif
                            text-lg
                            font-semibold
                            text-[var(--color-brand)]
                        "
                    >
                        {book} {chapter}:{selectedVerse}
                    </p>
                ) : (
                    <div
                        className="
                            mt-3
                            rounded-xl
                            border
                            border-dashed
                            border-[var(--border)]
                            bg-[var(--bg-surface)]
                            px-5
                            py-5
                        "
                    >
                        <p
                            className="
                                font-serif
                                text-sm
                                italic
                                leading-6
                                text-[var(--text-muted)]
                            "
                        >
                            Select a verse from Scripture
                            when you're ready to write.
                        </p>
                    </div>
                )}
            </div>

            {/* Note composer */}
            {selectedVerse && (
                <div
                    className="
                        relative
                        mb-10
                        overflow-hidden
                        rounded-2xl
                        border
                        border-[var(--border)]
                        bg-[var(--bg-selected)]
                        shadow-sm
                    "
                >
                    <div
                        className="
                            absolute
                            bottom-0
                            left-0
                            top-0
                            w-[3px]
                            bg-[var(--color-accent)]
                        "
                    />

                    <div
                        className="
                            flex
                            items-center
                            justify-between
                            gap-4
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
                                    text-[9px]
                                    font-bold
                                    uppercase
                                    tracking-[0.18em]
                                    text-[var(--text-muted)]
                                "
                            >
                                New Reflection
                            </p>

                            <p
                                className="
                                    mt-1
                                    font-serif
                                    text-sm
                                    font-semibold
                                    text-[var(--color-brand)]
                                "
                            >
                                {book} {chapter}:{selectedVerse}
                            </p>
                        </div>

                        <div
                            className="
                                flex
                                h-8
                                w-8
                                items-center
                                justify-center
                                rounded-full
                                border
                                border-[var(--border)]
                                text-sm
                                text-[var(--color-accent-text)]
                            "
                        >
                            ✦
                        </div>
                    </div>

                    <textarea
                        value={noteContent}
                        onChange={(event) =>
                            setNoteContent(event.target.value)
                        }
                        placeholder="Write what you notice, what you wonder, or what you want to remember..."
                        rows="7"
                        className="
                            block
                            w-full
                            resize-none
                            border-0
                            bg-transparent
                            px-6
                            py-5
                            font-serif
                            text-[15px]
                            leading-8
                            text-[var(--text-primary)]
                            outline-none
                            placeholder:text-[var(--text-muted)]
                            placeholder:opacity-60
                        "
                    />

                    <div
                        className="
                            flex
                            items-center
                            justify-between
                            gap-4
                            border-t
                            border-[var(--border)]
                            px-5
                            py-3
                            sm:px-6
                        "
                    >
                        <p
                            className="
                                hidden
                                font-serif
                                text-[10px]
                                italic
                                text-[var(--text-muted)]
                                sm:block
                            "
                        >
                            Private to your Gnosis account
                        </p>

                        <button
                            onClick={onSave}
                            disabled={
                                isSavingNote ||
                                !noteContent.trim()
                            }
                            className="
                                ml-auto
                                rounded-full
                                bg-[var(--color-brand)]
                                px-6
                                py-2.5
                                text-[11px]
                                font-semibold
                                tracking-[0.04em]
                                text-white
                                shadow-sm
                                transition-all
                                hover:-translate-y-[1px]
                                hover:bg-[var(--color-brand-dark)]
                                hover:shadow-md
                                disabled:translate-y-0
                                disabled:cursor-not-allowed
                                disabled:opacity-40
                                disabled:shadow-none
                            "
                        >
                            {isSavingNote
                                ? "Saving..."
                                : "Save Reflection"
                            }
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}