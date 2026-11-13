// Notes 2.0 editor slot — the component boundary for the rich-text editor.
//
// Phase 1 renders the existing plain-text textarea so current Notes keep
// working with no behavior change. Codex's rich-text editor replaces this
// component's internals, keeping the same props, so the layout never
// imports an editor engine directly.
//
// Integration contract (see the PR description for the full interface):
//   value: string                — the note content
//   onChange: (value) => void    — called with the new content
//   placeholder?: string
//   disabled?: boolean
//   autoFocus?: boolean
//   ariaLabel?: string
//   inputRef?: ref               — the underlying editable element, for
//                                  focusing from the panel header
//   className?: string           — extra classes (e.g. the desktop font
//                                  size); the base size stays text-base
//                                  (16px) so iOS never zooms on focus.
export default function NotesEditor({
    value,
    onChange,
    placeholder,
    disabled = false,
    autoFocus = false,
    ariaLabel,
    inputRef,
    className = "",
}) {
    return (
        <textarea
            ref={inputRef}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            autoFocus={autoFocus}
            aria-label={ariaLabel}
            // 16px text prevents iOS Safari from zooming on focus.
            className={`
                block
                h-full
                min-h-0
                w-full
                flex-1
                resize-none
                border-0
                bg-transparent
                px-5
                py-4
                font-serif
                text-base
                leading-8
                text-[var(--text-primary)]
                outline-none
                placeholder:text-[var(--text-muted)]
                placeholder:opacity-60
                disabled:opacity-50
                ${className}
            `}
        />
    );
}
