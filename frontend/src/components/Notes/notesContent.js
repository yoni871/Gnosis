export function plainText(content = "") {
    if (!content.includes("<")) return content;
    return new DOMParser().parseFromString(content, "text/html").body.textContent || "";
}

const ALLOWED_TAGS = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "H1", "H2", "H3", "UL", "OL", "LI", "BLOCKQUOTE"]);

export function sanitizeRichText(content = "") {
    if (!content.includes("<")) return content;
    const documentNode = new DOMParser().parseFromString(content, "text/html");
    for (const element of [...documentNode.body.querySelectorAll("*")]) {
        if (!ALLOWED_TAGS.has(element.tagName)) {
            if (["SCRIPT", "STYLE", "IFRAME", "OBJECT"].includes(element.tagName)) element.remove();
            else element.replaceWith(...element.childNodes);
            continue;
        }
        for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    }
    return documentNode.body.innerHTML;
}
