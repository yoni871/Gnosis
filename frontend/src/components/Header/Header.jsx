import {
     BookOpen,
     Sun,
     ChevronDown,
     PanelRight,
     Layers,
     Menu
    } from 'lucide-react';
import SearchBar from './SearchBar';
import { useState } from 'react';

function Header({ showSearch = true, variant = "default" }) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    
    return (
        <header 
            className="
                fixed
                top-0
                left-0
                right-0
                z-50
                flex h-[50px] 
                items-center 
                justify-between 
                border-b 
                border-[var(--border)] 
                bg-[rgba(244,233,205,0.96)] 
                px-9
            "
        >

            <div 
                className="flex items-center 
                            gap-2.5 
                            text-[var(--burgundy)]"
                            >

                <div className="
                    flex h-7 w-7 
                    items-center justify-center
                    rounded-[7px]
                    border border-[#B08D57]
                    text-[#B08D57]
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
                        text-[#6B1F2A]
                    ">
                        Gnosis
                    </h1>

                    <p className="
                        mt-[2px]
                        mb-0
                        text-[7px]
                        font-semibold
                        tracking-[2.7px]
                        text-[#8A7964]
                    ">
                        BIBLE COMMENTARY
                    </p>
                </div>
            </div>
            
            <div className="hidden items-center gap-2.5 md:flex">

                {showSearch && (
                    <SearchBar variant={variant}/>
                )}

                {showSearch &&  variant === "default" && (
                    <div className="
                        flex h-[29px] min-w-[125px]
                        items-center gap-[2px]
                        rounded-lg border border-[var(--border)]
                        bg-[#E8DDC8] p-[3px]
                    ">
                        <div className="
                            flex h-[23px] flex-1
                            items-center gap-1
                            rounded-md bg-[#FFFDF8]
                            px-[7px]
                            text-[9px] text-[var(--burgundy)]
                            shadow-sm
                        ">
                            <PanelRight size={13} />
                            <span>Side</span>
                        </div>

                        <div className="
                            flex h-[23px] flex-1
                            items-center gap-1
                            rounded-md px-[7px]
                            text-[9px] text-[#8A7964]
                            cursor-pointer
                        ">
                            <Layers size={13} />
                            <span>Stack</span>
                        </div>
                    </div>
                )}
                

                <button
                    className="
                        flex h-[29px] w-[29px]
                        items-center justify-center
                        rounded-[7px]
                        border border-[#B08D57]
                        bg-transparent
                        text-[#8A7048]
                        cursor-pointer
                        hover:bg-[#E8DDC8]
                    "
                >
                    <Sun size={15} />
                </button>

                <div
                    className="
                        flex h-[30px]
                        items-center gap-[7px]
                        rounded-full
                        border border-[var(--border)]
                        bg-[#F8F2E6]
                        py-0 pr-[7px] pl-1
                        text-[10px] text-[var(--text)]
                        cursor-pointer
                    "
                >
                    <div
                        className="
                            flex h-[23px] w-[23px]
                            items-center justify-center
                            rounded-full
                            bg-[var(--burgundy)]
                            text-[8px] font-bold
                            tracking-[0.5px] text-white
                        "
                    >
                            YD
                    </div>

                    <span className="
                        whitespace-nowrap
                        font-serif
                        text-[10px]
                        font-semibold
                    ">
                        Yonatan Demissie
                    </span>

                    <ChevronDown 
                        size={13} 
                        className="text-[var(--muted)]"
                    />
                    
                </div>
            </div>
            <button
                className='flex h-[36px] w-[36px]
                items-center justify-center
                rounded-md
                text-[var(--burgundy)]
                md:hidden
                '
                onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
                <Menu size={22} />
            </button>

            {isMenuOpen && (
                <div className="
                    absolute
                    right-4 top-[58px]
                    z-50
                    w-[260px]
                    rounded-lg
                    border border-[var(--border)]
                    bg-[var(--panel)]
                    p-4
                    shadow-lg
                    md:hidden
                ">
                    {showSearch && (
                        <div className="mb-4">
                            <SearchBar variant={variant} />
                        </div>
                    )}

                    {showSearch && variant === 'default' && (
                        <div className="
                            mb-4
                            flex h-[36px]
                            items-center gap-1
                            rounded-lg
                            border border-[var(--border)]
                            bg-[#E8DDC8]
                            p-1
                        ">
                            <div className="
                                flex flex-1
                                items-center justify-center gap-1
                                rounded-md
                                bg-[#FFFDF8]
                                py-2
                                text-xs
                                text-[var(--burgundy)]
                            ">
                                <PanelRight size={14} />
                                <span>Side</span>
                            </div>

                            <div className="
                                flex flex-1
                                items-center justify-center gap-1
                                rounded-md
                                py-2
                                text-xs
                                text-[#8A7964]
                            ">
                                <Layers size={14} />
                                <span>Stack</span>
                            </div>
                        </div>
                    )}

                    <button className="
                        mb-3
                        flex w-full
                        items-center gap-3
                        rounded-md
                        p-2
                        text-sm
                        text-[var(--text)]
                        hover:bg-[#E8DDC8]
                    ">
                        <Sun size={17} />
                        <span>Theme</span>
                    </button>

                    {/* Profile */}
                    <div className="
                        flex items-center gap-3
                        rounded-md
                        p-2
                        text-sm
                        text-[var(--text)]
                    ">
                        <div className="
                            flex h-8 w-8
                            items-center justify-center
                            rounded-full
                            bg-[var(--burgundy)]
                            text-xs font-bold
                            text-white
                        ">
                            YD
                        </div>

                        <span className="font-serif font-semibold">
                            Yonatan Demissie
                        </span>
                    </div>
                </div>
            )}
        </header>
    )
}

export default Header;