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

                <ChevronDown size={18} />

            </button>

            {isCommentaryOpen && (

                <div className="
                    absolute
                    left-0
                    right-0
                    top-[calc(100%+6px)]
                    z-[100]
                    overflow-hidden
                    rounded-[8px]
                    border
                    border-[var(--border)]
                    bg-[var(--bg-panel)]
                    shadow-[0_6px_16px_rgba(0,0,0,0.12)]
                ">

                    {commentators.map((commentator) => (

                        <div
                            key={commentator.id}
                            className="
                                cursor-pointer
                                px-[16px]
                                py-[12px]
                                text-[14px]
                                text-[var(--text-primary)]
                                transition-colors
                                duration-150
                                hover:bg-[var(--bg-control-hover)]
                            "
                            onClick={() => {
                                setSelectedCommentator(commentator.id);
                                setIsCommentaryOpen(false);
                            }}
                        >
                            {commentator.name}
                        </div>

                    ))}

                </div>

            )}

        </div>
    )
}