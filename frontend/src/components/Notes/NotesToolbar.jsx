import { Bold, Heading2, Italic, List, ListOrdered, Redo2, Underline, Undo2 } from "lucide-react";

// Compact formatting toolbar — presentation only.
//
// The buttons render the formatting controls and report which action was
// chosen through onFormat. The formatting behavior itself belongs to the
// rich-text editor (Codex): it wires onFormat to the editor engine. Until
// then the buttons are inert by design — this component implements no
// formatting, autosave, or persistence.
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

export default function NotesToolbar({ onFormat, disabled = false }) {
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
                    disabled={disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onFormat?.(id)}
                    className="
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
                    "
                >
                    <Icon size={16} aria-hidden="true" />
                </button>
            ))}
        </div>
    );
}
