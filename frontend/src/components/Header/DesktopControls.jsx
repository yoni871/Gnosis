import { useContext } from "react";
import {
    Sun,
    Moon,
    PanelRight,
    Layers
} from "lucide-react";
import { Link } from "react-router-dom";

import SearchBar from "./SearchBar";
import ProfileMenu from "./ProfileMenu";
import ThemeContext from "../../context/ThemeContext";
import AuthContext from "../../context/AuthContext";
import AuthActions from "./AuthActions";

export default function DesktopControls({
    showSearch,
    variant,
    layout,
    setLayout,
    translation
}) {
    const { theme, setTheme } = useContext(ThemeContext);
    const { isAuthenticated } = useContext(AuthContext);

    return (
        <div className="hidden items-center gap-2.5 md:flex">

            {showSearch && (
                <SearchBar 
                    variant={variant}
                    translation={translation}
                />
            )}

            {showSearch &&  variant === "default" && (
                <div className="
                    relative
                    flex h-[34px] min-w-[140px]
                    items-center gap-[2px]
                    rounded-lg border border-[var(--border)]
                    bg-[var(--bg-surface)] p-[3px]
                ">
                    {/* sliding active background */}
                    <div
                        className={`
                            absolute top-[3px] bottom-[3px]
                            w-[calc(50%-2px)]
                            rounded-md
                            bg-[var(--bg-selected)]
                            shadow-sm
                            transition-transform duration-300 ease-in-out
                            ${layout === "stack"
                                ? "translate-x-[calc(100%-2px)]"
                                : "translate-x-0"
                            }
                        `}
                    />

                    <div 
                        className={`
                            relative z-10
                            flex h-[28px] flex-1
                            items-center gap-1
                            rounded-md
                            px-[7px]
                            text-[11px]
                            cursor-pointer
                            transition-colors duration-200
                            ${layout === "side"
                                ? "text-[var(--color-brand)]"
                                : "text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--color-brand)]"
                            }
                        `}
                        onClick={() => setLayout("side")}
                    >
                        <PanelRight size={13} />
                        <span>Side</span>
                    </div>

                    <div 
                        className={`
                            relative z-10
                            flex h-[28px] flex-1
                            items-center gap-1
                            rounded-md 
                            px-[7px]
                            text-[11px]
                            cursor-pointer
                            transition-colors duration-200
                            ${layout === "stack"
                                ? "text-[var(--color-brand)]"
                                : "text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--color-brand)]"
                            }
                        `}
                        onClick={() => setLayout("stack")}
                    >
                        <Layers size={13} />
                        <span>Stack</span>
                    </div>
                </div>
            )}
            

            <button
                className="
                    flex h-[34px] w-[34px]
                    items-center justify-center
                    rounded-[7px]
                    border border-[var(--color-accent)]
                    bg-transparent
                    cursor-pointer
                    transition-colors duration-200
                    text-[var(--theme-icon)]
                    hover:bg-[var(--theme-icon-hover)]
                "
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
                {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>

            {isAuthenticated ? (
                <ProfileMenu />
            ) : (
                <div
                    className="
                        ml-3
                        flex
                        items-center
                        border-l
                        border-[var(--border)]
                        pl-12
                    "
                >
                    <AuthActions />
                </div>
            )}

        </div>
    );
}

