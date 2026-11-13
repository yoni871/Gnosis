import { Mark } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { parseScriptureMentions } from "./scriptureMentions";

export default Mark.create({
    name: "scriptureReference",
    inclusive: false,
    addOptions() { return { books: [] }; },
    addAttributes() { return { target: { default: null } }; },
    parseHTML() { return [{ tag: "a[data-scripture]", getAttrs: (node) => ({ target: node.getAttribute("data-target") }) }]; },
    renderHTML({ HTMLAttributes }) {
        return ["a", { "data-scripture": "true", "data-target": HTMLAttributes.target, class: "note-scripture-link" }, 0];
    },
    addProseMirrorPlugins() {
        const type = this.type;
        const books = this.options.books;
        const key = new PluginKey("scripture-reference-detection");
        return [new Plugin({
            key,
            view(view) {
                queueMicrotask(() => {
                    if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, "scan"));
                });
                return {};
            },
            appendTransaction(transactions, _oldState, newState) {
                if (!transactions.some((transaction) => transaction.docChanged || transaction.getMeta(key) === "scan")) return null;
                if (transactions.some((transaction) => transaction.getMeta(key) === true)) return null;
                const transaction = newState.tr;
                transaction.removeMark(0, newState.doc.content.size, type);
                newState.doc.descendants((node, position) => {
                    if (!node.isTextblock) return;
                    const segments = [];
                    let text = "";
                    node.descendants((child, childPosition) => {
                        if (!child.isText || !child.text) return;
                        segments.push({ from: text.length, to: text.length + child.text.length, position: position + 1 + childPosition });
                        text += child.text;
                    });
                    let offset = 0;
                    for (const part of parseScriptureMentions(text, books)) {
                        const length = part.text.length;
                        if (part.type === "reference") {
                            const end = offset + length;
                            for (const segment of segments) {
                                const from = Math.max(offset, segment.from);
                                const to = Math.min(end, segment.to);
                                if (from < to) transaction.addMark(
                                    segment.position + from - segment.from,
                                    segment.position + to - segment.from,
                                    type.create({ target: JSON.stringify(part) })
                                );
                            }
                        }
                        offset += length;
                    }
                    return false;
                });
                return transaction.steps.length ? transaction.setMeta(key, true) : null;
            }
        })];
    }
});
