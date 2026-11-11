import { useId, useRef } from "react";
import ReaderDropdownOptions from "../ReaderDropdownOptions";
import { ChevronDown } from 'lucide-react'
import useClickOutside from '../../hooks/useClickOutside';

export default function CommentatorSelector({
    commentators,
    selectedCommentator,
    setSelectedCommentator,
    isCommentaryOpen,
    setIsCommentaryOpen
}) {

    const triggerRef = useRef(null);
    const menuId = useId();
    const dropdownRef = useClickOutside(() => {
        setIsCommentaryOpen(false)
    })

    // The commentary list arrives in database order; the menu shows it
    // alphabetically by name so a growing list stays findable. Sorted
    // here at render time only — the underlying order is untouched.
    const sortedCommentators = [...commentators].sort((a, b) =>
        a.name.localeCompare(b.name)
    );

    //find the current selected commentator
    const selected = commentators.find(
        (commentator) => commentator.id === selectedCommentator
    );

    return (
        <div ref={dropdownRef} className="relative w-full">

            <button
                type="button"
                ref={triggerRef}
                aria-expanded={isCommentaryOpen}
                aria-controls={menuId}
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
                            selected?.name
                        }
                    </strong>

                    <span className="
                        text-[11px]
                        text-[var(--text-muted)]
                    ">
                        {
                            selected?.title
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
                <div id={menuId} className="absolute left-0 right-0 top-[calc(100%+6px)] z-[100] rounded border border-[var(--border)] bg-[var(--bg-panel)] p-[4px] shadow-lg">
                    <ReaderDropdownOptions
                        items={sortedCommentators.map((item) => ({ value: item.id, label: item.name, description: item.title }))}
                        selectedValue={selectedCommentator}
                        onSelect={setSelectedCommentator}
                        onClose={() => setIsCommentaryOpen(false)}
                        triggerRef={triggerRef}
                        searchLabel="Search commentaries"
                        testId="commentator-list"
                        maxHeight={200}
                    />
                </div>
            )}

        </div>
    )
}