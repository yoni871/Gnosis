import { useContext, useState } from "react";
import { Link } from "react-router-dom";
import {
    Menu,
    Moon,
    Sun
} from "lucide-react";
import SearchBar from "./SearchBar";
import ThemeContext from "../../context/ThemeContext";
import useClickOutside from "../../hooks/useClickOutside";
import AuthContext from "../../context/AuthContext";
import AuthActions from "./AuthActions";

export default function MobileMenu({ showSearch, variant, translation }) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isMobileProfileOpen, setIsMobileProfileOpen] = useState(false);

    const { theme, setTheme } = useContext(ThemeContext);

    const { user, isAuthenticated, logout } = useContext(AuthContext);

    const mobileMenuRef = useClickOutside(() => {
        setIsMenuOpen(false);
        setIsMobileProfileOpen(false);
    });

    const handleLogout = () => {
        logout();
        setIsMobileProfileOpen(false);
        setIsMenuOpen(false);
    };

  return (
    <div ref={mobileMenuRef} className="relative md:hidden">
        <button
            className='flex h-[36px] w-[36px]
            items-center justify-center
            rounded-md
            text-[var(--text-muted)]
            md:hidden
            '
            onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
            <Menu size={22} />
        </button>

        {isMenuOpen && (
            <div 
            className="
                absolute
                right-4 top-[58px]
                z-50
                w-[260px]
                rounded-lg
                border border-[var(--border)]
                bg-[var(--bg-panel)]
                p-4
                shadow-lg
                md:hidden
            ">
                {showSearch && (
                    <div className="mb-4 w-full max-w-full">
                        <SearchBar 
                            variant={variant} 
                            translation={translation} 
                            mobile 
                        />
                    </div>
                )}

                

                <button
                    className="
                        mb-3
                        flex w-full
                        items-center gap-3
                        rounded-md
                        p-2
                        text-sm
                        text-[var(--text-primary)]
                        hover:bg-[var(--hover-bg)]
                    "
                    onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                >
                    {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
                    <span>Theme</span>
                </button>

                {/* Profile */}
                {isAuthenticated ? (
                    <>
                        <button className="
                            flex w-full items-center gap-3
                            rounded-md
                            p-2
                            text-left
                            text-sm
                            text-[var(--text-primary)]
                            hover:bg-[var(--hover-bg)]
                            "
                            onClick={() => setIsMobileProfileOpen(!isMobileProfileOpen)}
                        >
                            <div className="
                                flex h-8 w-8
                                items-center justify-center
                                rounded-full
                                bg-[var(--color-brand)]
                                text-xs font-bold
                                text-white
                            ">
                                {`${user.first_name[0]}${user.last_name[0]}`}
                            </div>

                            <div className="min-w-0 flex-1">
                                <p className="
                                    m-0
                                    truncate
                                    font-serif
                                    text-sm
                                    font-semibold
                                    text-[var(--text-primary)]
                                ">
                                    {`${user.first_name} ${user.last_name}`}
                                </p>

                                <p className="
                                    mt-0.5
                                    mb-0
                                    truncate
                                    text-[10px]
                                    font-normal
                                    text-[var(--text-muted)]
                                ">
                                    {user.email}
                                </p>
                            </div>
                            
                        </button>

                        {isMobileProfileOpen && (
                            <div className="
                                mt-1
                                border-t
                                border-[var(--border)]
                                pt-1
                            ">
                                <button className="
                                    flex w-full
                                    rounded-md
                                    px-2 py-2
                                    text-left
                                    text-sm
                                    text-[var(--text-primary)]
                                    hover:bg-[var(--hover-bg)]
                                ">
                                    Profile
                                </button>

                                <button className="
                                    flex w-full
                                    rounded-md
                                    px-2 py-2
                                    text-left
                                    text-sm
                                    text-[var(--text-primary)]
                                    hover:bg-[var(--hover-bg)]
                                ">
                                    Notes
                                </button>

                                <button className="
                                    flex w-full
                                    rounded-md
                                    px-2 py-2
                                    text-left
                                    text-sm
                                    text-[var(--text-primary)]
                                    hover:bg-[var(--hover-bg)]
                                ">
                                    Bookmarks
                                </button>

                                <button className="
                                    flex w-full
                                    rounded-md
                                    px-2 py-2
                                    text-left
                                    text-sm
                                    text-[var(--text-primary)]
                                    hover:bg-[var(--hover-bg)]
                                ">
                                    Settings
                                </button>

                                <Link 
                                    to="/login"
                                    onClick={handleLogout}
                                    className="
                                        flex w-full
                                        rounded-md
                                        px-2 py-2
                                        text-left
                                        text-sm
                                        text-[var(--color-brand)]
                                        hover:bg-[var(--hover-bg)]
                                    "
                                >
                                    Sign out
                                </Link>
                            </div>
                        )}
                    </>

                ) : (
                    <div className="mt-2">
                        <AuthActions />
                    </div>
                )}

            </div>
        )}
    </div>
  )
}
