import { ChevronDown } from 'lucide-react'
import useClickOutside from '../../hooks/useClickOutside';

export default function CommentatorSelector({
    commentators,
    selectedCommentator,
    setSelectedCommentator,
    isCommentaryOpen,
    setIsCommentaryOpen
}) {

    const dropdownRef = useClickOutside(() => {
        setIsCommentaryOpen(false)
    })

    //find the current selected commentator
    const selected = commentators.find(
        (commentator) => commentator.id === selectedCommentator
    );

    return (
        <div ref={dropdownRef} className="relative w-full">

            <button
                className="
                    flex
                    w-full
                    items-center
                    justify-between
                    rounded-[10px]
                    border
                    border-[var(--border)]
                    bg-[var(--bg-panel)]
                    px-[14px]
                    py-[11px]
                    text-left
                    text-[var(--text-primary)]
                    cursor-pointer
                    transition
                    duration-200
                    hover:border-[var(--color-brand)]
                "
                onClick={() => setIsCommentaryOpen(!isCommentaryOpen)}
            >

                <div className="
                    flex
                    flex-col
                    gap-[5px]
                ">
                    <strong className="
                        font-serif
                        text-[16px]
                    ">
                        {
                            commentators.find(
                                (commentator) => commentator.id === selectedCommentator
                            )?.name
                        }
                    </strong>

                    <span className="
                        text-[11px]
                        text-[var(--text-muted)]
                    ">
                        {
                            commentators.find(
                                (commentator) => commentator.id === selectedCommentator
                            )?.title
                        }
                    </span>

                </div>

                <ChevronDown
                    size={18}
                    className={`
                        shrink-0
                        text-[var(--color-brand)]
                        transition-transform
                        duration-200
                        ${isCommentaryOpen ? "rotate-180" : ""}
                    `}
                    />

            </button>

            {isCommentaryOpen && (

                <div className="
                    absolute
                    left-0
                    right-0
                    top-[calc(100%+6px)]
                    z-[100]
                    border
                    border-[var(--border)]
                    bg-[var(--bg-panel)]
                    p-[4px]
                    shadow-lg
                    "
                >

                    {commentators.map((commentator, index) => (
                        <div
                            key={commentator.id}
                            className={`
                            cursor-pointer
                            rounded
                            px-2
                            py-2
                            text-[var(--text-primary)]
                            transition-colors
                            hover:bg-[var(--bg-control-hover)]
                            ${
                                selectedCommentator === commentator.id
                                ? "bg-[var(--bg-control-hover)] font-semibold !text-[var(--color-brand)]"
                                : ""
                            }
                            ${
                                index !== commentators.length - 1
                                ? "border-b border-[var(--border)]"
                                : ""
                            }
                            `}
                            onClick={() => {
                            setSelectedCommentator(commentator.id);
                            setIsCommentaryOpen(false);
                            }}
                        >
                            <div className="
                            text-[11px]
                            font-semibold
                            ">
                            {commentator.name}
                            </div>

                            <div className="
                            mt-[2px]
                            text-[9px]
                            font-normal
                            text-[var(--text-muted)]
                            ">
                            {commentator.title}
                            </div>
                        </div>
                        ))}

                </div>

            )}

        </div>
    )
}