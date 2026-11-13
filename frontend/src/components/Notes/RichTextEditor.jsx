import { useEffect, useRef } from "react";
import { Bold, Heading2, Italic, List, ListOrdered, Underline } from "lucide-react";
import { sanitizeRichText } from "./notesContent";

const tools = [
    ["bold", Bold, "Bold"], ["italic", Italic, "Italic"], ["underline", Underline, "Underline"],
    ["formatBlock", Heading2, "Heading", "h2"], ["insertUnorderedList", List, "Bulleted list"],
    ["insertOrderedList", ListOrdered, "Numbered list"]
];

export default function RichTextEditor({ value, onChange, onBlur }) {
    const ref = useRef(null);
    useEffect(() => {
        const safeValue = sanitizeRichText(value);
        if (ref.current && ref.current.innerHTML !== safeValue) ref.current.innerHTML = safeValue;
    }, [value]);
    const command = (name, argument) => {
        ref.current?.focus();
        document.execCommand(name, false, argument);
        onChange(ref.current?.innerHTML || "");
    };
    return <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap gap-1 border-y border-[var(--border)] px-5 py-2" role="toolbar" aria-label="Note formatting">
            {tools.map(([name, Icon, label, argument]) => <button key={label} type="button" title={label} aria-label={label}
                onMouseDown={(event) => event.preventDefault()} onClick={() => command(name, argument)}
                className="rounded-md p-2 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--color-brand)]"><Icon size={16} /></button>)}
        </div>
        <div ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-label="Note content" aria-multiline="true"
            data-placeholder="Begin writing…" onInput={() => onChange(ref.current?.innerHTML || "")} onBlur={onBlur}
            className="gnosis-note-editor min-h-[18rem] flex-1 overflow-y-auto px-7 py-7 font-serif text-[16px] leading-8 text-[var(--text-primary)] outline-none" />
    </div>;
}
