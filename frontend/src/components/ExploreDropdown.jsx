import { useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import useClickOutside from "../hooks/useClickOutside";

const DEFAULT_ITEMS = [
    {
        title: "Bible & Commentary",
        description: "Read Scripture alongside trusted biblical commentary.",
        to: "/bible/Genesis/1",
    },
];

// A disclosure containing normal navigation links, rather than an ARIA menu.
// The data-driven items can grow without changing keyboard/focus behavior.
export default function ExploreDropdown({ items = DEFAULT_ITEMS, onNavigate }) {
    const [open, setOpen] = useState(false);
    const trigger = useRef(null);
    const id = useId();
    const root = useClickOutside(() => setOpen(false));

    return (
        <div ref={root} className="landing-explore-dropdown"
            onBlur={event => {
                if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
            }}
            onKeyDown={event => {
                if (event.key === "Escape" && open) {
                    event.stopPropagation();
                    setOpen(false);
                    trigger.current?.focus();
                }
            }}
        >
            <button type="button" className="landing-explore-trigger"
                aria-expanded={open} aria-controls={id} ref={trigger}
                onClick={() => setOpen(value => !value)}
            >
                Explore <ChevronDown size={14} aria-hidden="true" />
            </button>
            {open && (
                <ul id={id} className="landing-explore-options">
                    {items.map(item => (
                        <li key={item.to}>
                            <Link to={item.to} onClick={() => { setOpen(false); onNavigate?.(); }}>
                                <span className="landing-explore-title">{item.title}</span>
                                <span className="landing-explore-description">{item.description}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
