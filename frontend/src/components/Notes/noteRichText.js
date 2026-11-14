import { isLineHeight, isParagraphSpacing } from "./noteSpacing";

const ALLOWED = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "S", "H1", "H2", "H3", "UL", "OL", "LI", "BLOCKQUOTE", "A"]);

// Spacing data attributes are allowed only on the blocks the spacing
// extension writes them to (paragraphs and headings), and only with
// whitelisted values. Anything else — including the same attributes on
// other tags or with other values — is stripped. Inline `style` is never
// allowed, so no arbitrary CSS can pass through a saved note.
const SPACING_BLOCKS = new Set(["P", "H1", "H2", "H3"]);
const SPACING_ATTRIBUTES = { "data-line-height": isLineHeight, "data-paragraph-spacing": isParagraphSpacing };

export function sanitizeNoteHtml(value = "") {
    if (!value.includes("<")) return value;
    const parsed = new DOMParser().parseFromString(value, "text/html");
    for (const element of [...parsed.body.querySelectorAll("*")]) {
        if (!ALLOWED.has(element.tagName)) {
            if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "IMG", "SVG"].includes(element.tagName)) element.remove();
            else element.replaceWith(...element.childNodes);
            continue;
        }
        for (const attribute of [...element.attributes]) {
            const scriptureAttribute = element.tagName === "A" && ["data-scripture", "data-target"].includes(attribute.name);
            const scriptureClass = element.tagName === "A" && element.hasAttribute("data-scripture") && attribute.name === "class";
            const spacingAttribute = SPACING_BLOCKS.has(element.tagName)
                && SPACING_ATTRIBUTES[attribute.name]?.(attribute.value);
            if (scriptureClass) element.setAttribute("class", "note-scripture-link");
            else if (!scriptureAttribute && !spacingAttribute) element.removeAttribute(attribute.name);
        }
        if (element.tagName === "A" && !element.hasAttribute("data-scripture")) element.replaceWith(...element.childNodes);
    }
    return parsed.body.innerHTML;
}

export function notePlainText(value = "") {
    if (!value.includes("<")) return value;
    return new DOMParser().parseFromString(value, "text/html").body.textContent || "";
}
