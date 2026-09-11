import { useState } from 'react';
import { Search, Command } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function SearchBar({ variant = "default" }) {

    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState("");

    const handleSearch = () => {
        if(!searchQuery.trim()) {
            return;
        }

        navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
    }

    return (
        <div
            className={`
                ${variant === "searchResults"
                ? "absolute left-1/2 -translate-x-1/2"
                : "relative"
                }
            `}
        >
            <div
                className={`
                flex items-center gap-2
                rounded-lg
                border border-[var(--border)]
                bg-[#F8F2E6]
                px-3
                ${variant === "searchResults"
                    ? "h-[30px] w-[220px] sm:w-[280px] md:w-[320px]"
                    : "h-[29px] w-[240px] sm:w-[270px] md:w-[300px]"
                }
                `}
            >
                <Search
                    size={14}
                    className="shrink-0 text-[var(--muted)]"
                />

                <input
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
                        text-[10px]
                        text-[var(--text)]
                        outline-none
                        placeholder:text-[var(--muted)]
                    "
                />

                <div
                    className="
                        flex shrink-0 items-center gap-0.5
                        rounded
                        border border-[var(--border)]
                        px-1.5 py-0.5
                        text-[9px]
                        text-[var(--muted)]
                    "
                    >
                    <Command size={10} />
                    <span>K</span>
                </div>
            </div>
        </div>
    )
}
