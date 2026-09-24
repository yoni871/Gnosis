import { BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import MobileMenu from './MobileMenu';
import DesktopControls from './DesktopControls';

function Header({ 
    showSearch = true, 
    variant = "default",
    layout,
    setLayout,
    translation = "BSB"

}) {
    
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
            
            <DesktopControls
                showSearch={showSearch}
                variant={variant}
                layout={layout}
                setLayout={setLayout}
                translation={translation}
            />

            <MobileMenu
                showSearch={showSearch}
                variant={variant}
                translation={translation}
            />

        </header>
    )
}

export default Header;