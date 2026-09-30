import { useState } from "react";

import CommentatorSelector from "./CommentatorSelector";
import CommentaryEntry from "./CommentaryEntry";


export default function CommentaryPanel({
    book,
    chapter,
    selectedVerse,
    commentaryState
}) {
    // This is temporary UI state, so it can remain inside the panel.
    const [isCommentaryOpen, setIsCommentaryOpen] = useState(false);

    const {
        commentary,

        selectedCommentator,
        setSelectedCommentator,

        commentators,

        isLoading,
        commentaryError
    } = commentaryState;


    return (
        <aside
            className="
                relative
                flex
                h-full
                flex-col
                overflow-hidden
                border-l
                border-[var(--border)]
                bg-[var(--bg-panel)]
                px-[clamp(20px,2.5vw,36px)]
                py-[16px]
                max-[768px]:border-l-0
                max-[768px]:border-t
                max-[768px]:py-[30px]
            "
        >
            <div
                className="
                    mb-[10px]
                    text-[10px]
                    font-semibold
                    tracking-[3px]
                    text-[var(--text-muted)]
                "
            >
                COMMENTARY
            </div>

            <CommentatorSelector
                commentators={commentators}
                selectedCommentator={selectedCommentator}
                setSelectedCommentator={setSelectedCommentator}
                isCommentaryOpen={isCommentaryOpen}
                setIsCommentaryOpen={setIsCommentaryOpen}
            />

            <div
                className="
                    mb-[15px]
                    mt-[22px]
                    flex
                    flex-col
                    items-start
                    gap-[7px]
                    bg-[var(--bg-surface)]
                    px-[11px]
                    py-[7px]
                    text-[11px]
                "
            >
                <strong className="text-[var(--color-brand)]">
                    {book} {chapter}
                </strong>

                <span
                    className="
                        text-[12px]
                        italic
                        leading-[1.5]
                        text-[var(--text-muted)]
                    "
                >
                    {commentary.length > 0
                        ? commentary[0].entry_title
                        : ""
                    }
                </span>
            </div>

            <div
                className="
                    min-h-0
                    flex-1
                    overflow-y-auto
                "
            >
                {isLoading ? (
                    <div
                        role="status"
                        className="
                            py-[40px]
                            text-center
                            font-serif
                            text-[14px]
                            italic
                            text-[var(--text-muted)]
                        "
                    >
                        Loading commentary…
                    </div>
                ) : commentaryError ? (
                    <div
                        role="alert"
                        className="
                            rounded-[8px]
                            border
                            border-[var(--border)]
                            bg-[var(--bg-surface)]
                            px-[16px]
                            py-[20px]
                            text-center
                            text-[14px]
                            leading-[1.6]
                            text-[var(--text-muted)]
                        "
                    >
                        {commentaryError}
                    </div>
                ) : commentary.length === 0 ? (
                    <div
                        className="
                            rounded-[8px]
                            border
                            border-dashed
                            border-[var(--border)]
                            px-[16px]
                            py-[28px]
                            text-center
                            font-serif
                            text-[14px]
                            italic
                            leading-[1.6]
                            text-[var(--text-muted)]
                        "
                    >
                        No commentary is available for this chapter.
                    </div>
                ) : (
                    <>
                        <p
                            className="
                                m-0
                                mb-[28px]
                                border-b
                                border-[var(--border)]
                                pb-[24px]
                                font-serif
                                text-[13px]
                                italic
                                leading-[1.75]
                                text-[var(--text-muted)]
                            "
                        >
                            {commentary[0].description}
                        </p>

                        {commentary.map((item, index) => {
                            const showTitle =
                                index === 0 ||
                                item.entry_title !==
                                    commentary[index - 1].entry_title;

                            const afterStart =
                                chapter > item.start_chapter ||
                                (
                                    chapter === item.start_chapter &&
                                    selectedVerse >= item.start_verse
                                );

                            const beforeEnd =
                                chapter < item.end_chapter ||
                                (
                                    chapter === item.end_chapter &&
                                    selectedVerse <= item.end_verse
                                );

                            const isMatch =
                                selectedVerse !== null &&
                                afterStart &&
                                beforeEnd;

                            return (
                                <CommentaryEntry
                                    key={item.id}
                                    item={item}
                                    book={book}
                                    isSelected={isMatch}
                                    showTitle={showTitle}
                                />
                            );
                        })}
                    </>
                )}
            </div>
        </aside>
    );
}