import { ChevronDown } from 'lucide-react'

export default function CommentatorSelector({
    commentators,
    selectedCommentator,
    setSelectedCommentator,
    isCommentaryOpen,
    setIsCommentaryOpen
}) {

    //find the current selected commentator
    const selected = commentators.find(
        (commentator) => commentator.id === selectedCommentator
    );

    return (
        <div className="relative w-full">

            <button 
                className="
                    flex
                    w-full
                    items-center
                    justify-between
                    rounded-[10px]
                    border
                    border-[var(--border)]
                    bg-[var(--panel)]
                    px-[14px]
                    py-[11px]
                    text-left
                    text-[var(--text)]
                    cursor-pointer
                    transition
                    duration-200
                    hover:border-[rgba(122,46,58,0.45)]
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
                        text-[var(--muted)]
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
                    border-[#d6c7ad]
                    bg-[#f7f1e3]
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
                                transition-colors
                                duration-150
                                hover:bg-[#ebe0cb]
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
