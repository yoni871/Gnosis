import { parseScriptureMentions } from "./scriptureMentions";

export default function NoteScriptureMentions({ content, books, onNavigate }) {
    return parseScriptureMentions(content, books).map((part, index) =>
        part.type === "reference" ? (
            <button
                key={`${part.text}-${index}`}
                type="button"
                onClick={() => onNavigate(part)}
                className="mx-0.5 inline rounded border border-[var(--color-accent)] bg-[var(--bg-surface)] px-1.5 py-0.5 font-serif font-semibold text-[var(--color-brand)] underline decoration-[var(--color-accent)] underline-offset-2 hover:bg-[var(--bg-control-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]"
                aria-label={`Open ${part.text} in Scripture`}
            >
                {part.text}
            </button>
        ) : <span key={index}>{part.text}</span>
    );
}
