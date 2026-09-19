import { useEffect, useRef, useState } from 'react';
import { Search, Command } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function SearchBar({ variant = "default", mobile = false, translation = "BSB" }) {

    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState("");
    const searchInputRef = useRef(null);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if(event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                searchInputRef.current?.focus();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        }
    }, []);

    const handleSearch = () => {
        if(!searchQuery.trim()) {
            return;
        }

        navigate(
            `/search?q=${encodeURIComponent(searchQuery)}` +
            `&translation=${encodeURIComponent(translation)}`
        );
    }

    return (
        <div
            className={`
                ${variant === "searchResults"
                ? "relative ml-auto mr-4"
                : "relative"
                }
            `}
        >
            <div
                className={`
                flex items-center gap-2
                rounded-lg
                border border-[var(--border)]
                bg-[var(--bg-input)]
                px-3
                transition-all duration-200
                hover:border-[var(--color-accent)]
                hover:bg-[var(--bg-selected)]
                focus-within:bg-[var(--bg-selected)]
                ${mobile
                    ? "h-[34px] w-full"
                    : variant === "searchResults"
                        ? "h-[30px] w-[220px] sm:w-[280px] md:w-[320px]"
                        : "h-[34px] w-[250px] sm:w-[280px] md:w-[310px]"
                    }
                `}
            >
                <Search
                    size={16}
                    className="shrink-0 text-[var(--text-muted)]"
                />

                <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search for a word or phrase..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                        handleSearch();
                        }
                }}
                    className="
                        min-w-0 flex-1
                        bg-transparent
                        text-[11px]
                        text-[var(--text-primary)]
                        outline-none
                        placeholder:text-[var(--text-muted)]
                    "
                />

                <div
                    className="
                        flex shrink-0 items-center gap-0.5
                        rounded
                        border border-[var(--border)]
                        bg-[var(--bg-selected)]
                        px-1.5 py-0.5
                        text-[9px]
                        text-[var(--text-muted)]
                    "
                    >
                    <Command size={10} />
                    <span>K</span>
                </div>
            </div>
        </div>
    )
}
