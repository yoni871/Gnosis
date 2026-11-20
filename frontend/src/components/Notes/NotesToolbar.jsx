import { Bold, ChevronDown, Heading2, Italic, List, ListOrdered, Redo2, Underline, Undo2 } from "lucide-react";
import { DEFAULT_LINE_HEIGHT, DEFAULT_PARAGRAPH_SPACING, LINE_HEIGHT_OPTIONS, PARAGRAPH_SPACING_OPTIONS } from "./noteSpacing";

// Compact formatting toolbar — presentation only.
//
// The buttons report which action was chosen through onFormat; the
// formatting behavior itself lives in the rich-text editor, which wires
// onFormat to the editor engine. Spacing is reported the same way, as an
// object action — { kind: "lineHeight", value: "2" } or
// { kind: "paragraphSpacing", value: "large" } — and the editor applies it
// to the selected paragraph(s) in one transaction.
//
// The dropdowns are native <select> elements: compact, keyboard
// accessible, and usable with the platform picker on mobile. They show the
// active setting from `active` (unset reports the defaults, Normal /
// Medium). Selecting from a dropdown blurs the editor, but the editor
// command re-focuses and restores the stored selection.
const ACTIONS = [
    { id: "bold", label: "Bold", Icon: Bold },
    { id: "italic", label: "Italic", Icon: Italic },
    { id: "underline", label: "Underline", Icon: Underline },
    { id: "heading", label: "Heading", Icon: Heading2 },
    { id: "list", label: "Bulleted list", Icon: List },
    { id: "orderedList", label: "Numbered list", Icon: ListOrdered },
    { id: "undo", label: "Undo", Icon: Undo2 },
    { id: "redo", label: "Redo", Icon: Redo2 },
];

const SELECT_CLASS = `
    h-8
    shrink-0
    cursor-pointer
    appearance-none
    rounded-md
    bg-transparent
    pl-2
    pr-5
    text-xs
    font-semibold
    text-[var(--text-muted)]
    transition
    hover:bg-[var(--hover-bg)]
    hover:text-[var(--text-primary)]
    focus-visible:outline
    focus-visible:outline-2
    focus-visible:outline-[var(--color-accent)]
    disabled:cursor-not-allowed
    disabled:opacity-40
`;

function SpacingSelect({ label, value, options, disabled, onSelect }) {
    return (
        <span className="relative flex shrink-0 items-center">
            <select
                aria-label={label}
                title={label}
                value={value}
                disabled={disabled}
                onChange={(event) => onSelect?.(event.target.value)}
                className={SELECT_CLASS}
            >
                {options.map(({ value: optionValue, label: optionLabel }) => (
                    <option key={optionValue} value={optionValue}>{optionLabel}</option>
                ))}
            </select>
            <ChevronDown size={12} aria-hidden="true" className="pointer-events-none absolute right-1.5 text-[var(--text-muted)]" />
        </span>
    );
}

export default function NotesToolbar({ onFormat, disabled = false, active = {} }) {
    return (
        <div
            role="toolbar"
            aria-label="Formatting"
            className="
                flex
                shrink-0
                items-center
                gap-1
                overflow-x-auto
                border-b
                border-[var(--border)]
                bg-[var(--bg-panel)]
                px-3
                py-1.5
            "
        >
            {ACTIONS.map(({ id, label, Icon }) => (
                <button
                    key={id}
                    type="button"
                    aria-label={label}
                    title={label}
                    aria-pressed={id === "undo" || id === "redo" ? undefined : Boolean(active[id])}
                    disabled={disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onFormat?.(id)}
                    className={`
                        flex
                        h-8
                        w-8
                        shrink-0
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
                        disabled:cursor-not-allowed
                        disabled:opacity-40
                        ${active[id] ? "bg-[var(--bg-selected)] text-[var(--color-brand)] ring-1 ring-inset ring-[var(--color-accent)]" : ""}
                    `}
                >
                    <Icon size={16} aria-hidden="true" />
                </button>
            ))}
            <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-[var(--border)]" />
            <SpacingSelect
                label="Line spacing"
                value={active.lineHeight || DEFAULT_LINE_HEIGHT}
                options={LINE_HEIGHT_OPTIONS}
                disabled={disabled}
                onSelect={(value) => onFormat?.({ kind: "lineHeight", value })}
            />
            <SpacingSelect
                label="Paragraph spacing"
                value={active.paragraphSpacing || DEFAULT_PARAGRAPH_SPACING}
                options={PARAGRAPH_SPACING_OPTIONS}
                disabled={disabled}
                onSelect={(value) => onFormat?.({ kind: "paragraphSpacing", value })}
            />
        </div>
    );
}
