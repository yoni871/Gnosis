import { useRef, useState } from "react";
import { Check, Search } from "lucide-react";

// Mounted only while its reader dropdown is open, so each menu owns a fresh query.
export default function ReaderDropdownOptions({
    items, selectedValue, onSelect, onClose, triggerRef, searchLabel, testId, maxHeight,
}) {
    const [query, setQuery] = useState("");
    const optionsRef = useRef(null);
    const search = query.trim().toLocaleLowerCase();
    const filtered = items.filter(({ label, description }) =>
        `${label} ${description ?? ""}`.toLocaleLowerCase().includes(search)
    );
    const close = () => {
        onClose();
        triggerRef.current?.focus({ preventScroll: true });
    };

    const handleKeyDown = (event) => {
        if (event.key === "Escape") {
            event.stopPropagation();
            event.preventDefault();
            close();
        } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            const inSearch = event.target.tagName === "INPUT";
            if (inSearch && (event.key === "Home" || event.key === "End")) return;
            const options = [...optionsRef.current.querySelectorAll("button")];
            if (!options.length) return;
            event.preventDefault();
            const current = options.indexOf(document.activeElement);
            let next;
            if (event.key === "Home") next = 0;
            else if (event.key === "End") next = options.length - 1;
            else if (event.key === "ArrowDown") next = (current + 1) % options.length;
            else next = current <= 0 ? options.length - 1 : current - 1;
            options[next].focus();
            options[next].scrollIntoView?.({ block: "nearest" });
        }
    };

    return (
        <div onKeyDown={handleKeyDown} className="font-normal tracking-normal">
            <div className="relative mb-1 border-b border-[var(--border)] p-1 pb-2">
                <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                    type="search"
                    autoFocus
                    aria-label={searchLabel}
                    placeholder={`${searchLabel}...`}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="h-9 w-full rounded border border-[var(--border)] bg-[var(--bg-input)] pl-7 pr-2 text-[16px] font-normal tracking-normal text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--color-brand)] focus-visible:ring-1 focus-visible:ring-[var(--color-brand)]"
                />
            </div>
            <div
                ref={optionsRef}
                data-testid={testId}
                className={`${maxHeight === 300 ? "max-h-[300px]" : "max-h-[200px]"} overflow-y-auto overscroll-contain`}
                style={{ maxHeight: `min(${maxHeight}px, 40dvh)` }}
            >
                {filtered.map(({ value, label, description }, index) => (
                    <button
                        type="button"
                        key={value}
                        aria-pressed={selectedValue === value}
                        className={`relative block w-full cursor-pointer rounded px-2 py-2 pr-7 text-left text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-control-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand)] ${selectedValue === value ? "bg-[var(--bg-control-hover)] font-semibold !text-[var(--color-brand)]" : ""} ${index !== filtered.length - 1 ? "border-b border-[var(--border)]" : ""}`}
                        onClick={() => { onSelect(value); close(); }}
                    >
                        <div className="text-[11px] font-semibold">{label}</div>
                        <div className="mt-[2px] text-[9px] font-normal text-[var(--text-muted)]">{description}</div>
                        {selectedValue === value && <Check size={14} aria-hidden="true" className="absolute right-2 top-3 text-[var(--color-brand)]" />}
                    </button>
                ))}
                {!filtered.length && <p role="status" className="px-2 py-3 text-[12px] text-[var(--text-muted)]">No results found</p>}
            </div>
        </div>
    );
}
