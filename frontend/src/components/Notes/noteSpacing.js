// Notes spacing controls — line height and paragraph spacing.
//
// Both settings are stored as data attributes on the block node that owns
// them (paragraph or heading), e.g. `<p data-line-height="2"
// data-paragraph-spacing="large">…</p>`. Data attributes — not inline
// styles — so the note sanitizer can allowlist the exact values and no
// arbitrary CSS can ever be smuggled through a saved note. The TipTap
// extension (NoteSpacingExtension) parses and renders these attributes;
// Notes.css maps each value to its line-height / margin.
//
// Unset means "default": the editor's base styles apply (line-height 1.65,
// paragraph margin .4em 0). The toolbar reports the unset state as the
// closest named defaults — Normal (1.5) / Medium — so the dropdowns always
// show a current value.

export const LINE_HEIGHT_OPTIONS = [
    { value: "1", label: "1.0 Single" },
    { value: "1.15", label: "1.15 Compact" },
    { value: "1.5", label: "1.5 Normal" },
    { value: "2", label: "2.0 Double" },
];

export const PARAGRAPH_SPACING_OPTIONS = [
    { value: "none", label: "None" },
    { value: "small", label: "Small" },
    { value: "medium", label: "Medium" },
    { value: "large", label: "Large" },
];

export const DEFAULT_LINE_HEIGHT = "1.5";
export const DEFAULT_PARAGRAPH_SPACING = "medium";

const LINE_HEIGHT_VALUES = new Set(LINE_HEIGHT_OPTIONS.map((option) => option.value));
const PARAGRAPH_SPACING_VALUES = new Set(PARAGRAPH_SPACING_OPTIONS.map((option) => option.value));

export function isLineHeight(value) {
    return typeof value === "string" && LINE_HEIGHT_VALUES.has(value);
}

export function isParagraphSpacing(value) {
    return typeof value === "string" && PARAGRAPH_SPACING_VALUES.has(value);
}

// Spacing of the first paragraph/heading in the selection (the block the
// cursor is in for a collapsed selection). Mixed selections report the
// first block's values; applying a setting normalizes every selected
// block to that value.
export function readActiveSpacing(state) {
    const { from, to } = state.selection;
    let attrs = null;
    state.doc.nodesBetween(from, to, (node) => {
        if (attrs) return false;
        if (node.type.name === "paragraph" || node.type.name === "heading") {
            attrs = node.attrs;
            return false;
        }
        return true;
    });
    return {
        lineHeight: isLineHeight(attrs?.lineHeight) ? attrs.lineHeight : DEFAULT_LINE_HEIGHT,
        paragraphSpacing: isParagraphSpacing(attrs?.paragraphSpacing)
            ? attrs.paragraphSpacing
            : DEFAULT_PARAGRAPH_SPACING,
    };
}
