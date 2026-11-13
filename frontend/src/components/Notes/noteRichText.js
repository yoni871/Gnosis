const ALLOWED = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "S", "H1", "H2", "H3", "UL", "OL", "LI", "BLOCKQUOTE", "A"]);

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
            if (!scriptureAttribute) element.removeAttribute(attribute.name);
        }
        if (element.tagName === "A" && !element.hasAttribute("data-scripture")) element.replaceWith(...element.childNodes);
    }
    return parsed.body.innerHTML;
}

export function notePlainText(value = "") {
    if (!value.includes("<")) return value;
    return new DOMParser().parseFromString(value, "text/html").body.textContent || "";
}
