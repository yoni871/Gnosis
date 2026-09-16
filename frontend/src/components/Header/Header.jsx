import {
     BookOpen,
     Sun,
     Moon,
     ChevronDown,
     PanelRight,
     Layers,
     Menu
    } from 'lucide-react';
import SearchBar from './SearchBar';
import { useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import ThemeContext from '../../context/ThemeContext';
import ProfileMenu from './ProfileMenu';
import useClickOutside from '../../hooks/useClickOutside';

function Header({ 
    showSearch = true, 
    variant = "default",
    layout,
    setLayout

}) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isMobileProfileOpen, setIsMobileProfileOpen] = useState(false);
    const { theme, setTheme } = useContext(ThemeContext);

    const mobileMenuRef = useClickOutside(() => {
        setIsMenuOpen(false);
        setIsMobileProfileOpen(false);
    });
    
    return (
        <header 
            className="
                fixed
                top-0
                left-0
                right-0
                z-50
                flex h-[58px] 
                items-center 
                justify-between 
                border-b 
                border-[var(--border)] 
                bg-[var(--bg-header)] 
                px-9
            "
        >

            <Link
                to="/bible/Genesis/1" 
                className="flex items-center 
                            gap-2.5 
                            text-[var(--color-brand)]
                            cursor-pointer
                            no-underline
                            transition-opacity
                            hover:opacity-80
                            "
                            >

                <div className="
                    flex h-7 w-7 
                    items-center justify-center
                    rounded-[7px]
                    border border-[var(--color-accent)]
                    text-[var(--color-accent)]
                ">
                    <BookOpen className="h-[17px] w-[17px] stroke-[1.6]"/>
                </div>
                
                <div>
                    <h1 className="
                        m-0
                        font-serif
                        text-[20px]
                        font-bold
                        tracking-[0.5px]
                        text-[var(--color-brand)]
                    ">
                        Gnosis
                    </h1>

                    <p className="
                        mt-[2px]
                        mb-0
                        text-[7px]
                        font-semibold
                        tracking-[2.7px]
                        text-[var(--text-muted)]
                    ">
                        BIBLE COMMENTARY
                    </p>
                </div>
            </Link>
            
            <div className="hidden items-center gap-2.5 md:flex">

                {showSearch && (
                    <SearchBar variant={variant}/>
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

                <ProfileMenu />

            </div>
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
                                <SearchBar variant={variant} mobile />
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
                                YD
                            </div>

                            <span className="font-serif font-semibold">
                                Yonatan Demissie
                            </span>
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

                                <button className="
                                    flex w-full
                                    rounded-md
                                    px-2 py-2
                                    text-left
                                    text-sm
                                    text-[var(--color-brand)]
                                    hover:bg-[var(--hover-bg)]
                                ">
                                    Sign out
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </header>
    )
}

export default Header;