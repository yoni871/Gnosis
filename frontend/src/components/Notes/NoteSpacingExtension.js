import { Extension } from "@tiptap/core";
import { isLineHeight, isParagraphSpacing } from "./noteSpacing";

// Spacing attributes for Notes paragraphs and headings.
//
// Implemented as TipTap global attributes (no new dependency, no node
// replacement): the attributes live on the paragraph/heading nodes, are
// serialized as data attributes in the saved HTML, and are read back by
// parseHTML when a note reopens. The sanitizer (noteRichText) allowlists
// exactly these two attributes with their whitelisted values, so spacing
// survives save → reload and nothing else can ride along in a style
// attribute — inline `style` is still stripped everywhere.
//
// Applying a setting walks every paragraph/heading in the selection and
// updates it in a single transaction, so the cursor/selection is preserved
// and the whole change is one Undo step. List items are reached through
// the paragraph inside each item, so a spaced list item never gets the
// margin twice (once on the item, once on its paragraph).

const SPACING_TYPES = ["paragraph", "heading"];

export const NoteSpacingExtension = Extension.create({
    name: "noteSpacing",

    addGlobalAttributes() {
        return [
            {
                types: SPACING_TYPES,
                attributes: {
                    lineHeight: {
                        default: null,
                        parseHTML: (element) => {
                            const value = element.getAttribute("data-line-height");
                            return isLineHeight(value) ? value : null;
                        },
                        renderHTML: (attributes) => (
                            isLineHeight(attributes.lineHeight)
                                ? { "data-line-height": attributes.lineHeight }
                                : {}
                        ),
                    },
                    paragraphSpacing: {
                        default: null,
                        parseHTML: (element) => {
                            const value = element.getAttribute("data-paragraph-spacing");
                            return isParagraphSpacing(value) ? value : null;
                        },
                        renderHTML: (attributes) => (
                            isParagraphSpacing(attributes.paragraphSpacing)
                                ? { "data-paragraph-spacing": attributes.paragraphSpacing }
                                : {}
                        ),
                    },
                },
            },
        ];
    },

    addCommands() {
        const setAttributeOnBlocks = (attribute, value) => ({ state, dispatch }) => {
            const { from, to } = state.selection;
            let transaction = state.tr;
            let changed = false;
            state.doc.nodesBetween(from, to, (node, position) => {
                if (!SPACING_TYPES.includes(node.type.name)) return true;
                if (node.attrs[attribute] === value) return false;
                transaction = transaction.setNodeMarkup(position, null, {
                    ...node.attrs,
                    [attribute]: value,
                });
                changed = true;
                return false;
            });
            if (!changed) return false;
            if (dispatch) dispatch(transaction);
            return true;
        };
        return {
            setLineHeight: (lineHeight) => (props) => (
                isLineHeight(lineHeight) ? setAttributeOnBlocks("lineHeight", lineHeight)(props) : false
            ),
            setParagraphSpacing: (paragraphSpacing) => (props) => (
                isParagraphSpacing(paragraphSpacing)
                    ? setAttributeOnBlocks("paragraphSpacing", paragraphSpacing)(props)
                    : false
            ),
        };
    },
});
