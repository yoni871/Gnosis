import { useState } from "react"
import {
    User,
    NotebookPen,
    Bookmark,
    Settings,
    LogOut,
    ChevronDown,
    ChevronUp
} from "lucide-react"
import useClickOutside from "../../hooks/useClickOutside";

export default function ProfileMenu() {
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    const profileRef = useClickOutside(() => {
        setIsProfileOpen(false)
    })

  return (
    <div ref={profileRef} className="relative">

        <button
            className={`
                flex h-[34px]
                items-center gap-2
                rounded-lg
                border border-[var(--border)]
                bg-[var(--bg-input)]
                py-0 pr-[7px] pl-1
                text-[11px] text-[var(--text-primary)]
                cursor-pointer
                transition-colors duration-200
                hover:bg-[var(--hover-bg)]
                hover:border-[var(--color-accent)]
                ${isProfileOpen
                    ? "border-[var(--color-accent)] bg-[var(--hover-bg)]"
                    : ""
                }
            `}
            onClick={() => setIsProfileOpen(!isProfileOpen)}
        >
            <div
                className="
                flex h-[26px] w-[26px]
                items-center justify-center
                rounded-md
                bg-[var(--color-brand)]
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
            {isProfileOpen ? (
                <ChevronUp
                    size={14}
                    className="text-[var(--text-muted)]"
                    strokeWidth={1.8}
                />
            ) : (
                <ChevronDown
                    size={14}
                    className="text-[var(--text-muted)]"
                    strokeWidth={1.8}
                />
            )}
        </button>

        
        <div className={`
            absolute
            right-0
            top-[calc(100%+8px)]
            z-50
            w-[260px]
            rounded-xl
            border border-[var(--border)]
            bg-[var(--bg-panel)]
            p-1.5
            shadow-lg
            origin-top-right
            transition-all duration-150 ease-out
            ${isProfileOpen
                ? "scale-100 opacity-100 translate-y-0"
                : "pointer-events-none scale-95 opacity-0 -translate-y-1"
            }
        `}
    >
            <div className="
                px-3 py-3
            ">
                <div className="
                    font-serif
                    text-[13px]
                    font-semibold
                    text-[var(--text-primary)]
                ">
                    Yonatan Demissie
                </div>

                <div className="
                    mt-1
                    text-[10px]
                    text-[var(--text-muted)]
                ">
                    email@email.com
                </div>
            </div>

            <div className="
                my-1
                border-t border-[var(--border)]
                " 
            />

            <button className="
                flex w-full
                items-center
                gap-2.5
                rounded-md
                px-3 py-2.5
                text-left
                text-[11px]
                text-[var(--text-primary)]
                hover:bg-[var(--bg-control-hover)]
            ">
                <User
                    size={15}
                    strokeWidth={1.8}
                    className="text-[var(--text-muted)]"
                />
                <span>Profile</span>
            </button>

            <button className="
                flex w-full
                items-center
                gap-2.5
                rounded-md
                px-3 py-2.5
                text-left
                text-[11px]
                text-[var(--text-primary)]
                hover:bg-[var(--bg-control-hover)]
            ">
                <NotebookPen
                    size={15}
                    strokeWidth={1.8}
                    className="text-[var(--text-muted)]"
                />
                <span>Notes</span>
            </button>

            <button className="
                flex w-full
                items-center
                gap-2.5
                rounded-md
                px-3 py-2.5
                text-left
                text-[11px]
                text-[var(--text-primary)]
                hover:bg-[var(--bg-control-hover)]
            ">
                <Bookmark
                    size={15}
                    strokeWidth={1.8}
                    className="text-[var(--text-muted)]"
                />
                <span>Bookmarks</span>
            </button>

            <button className="
                flex w-full
                items-center
                gap-2.5
                rounded-md
                px-3 py-2.5
                text-left
                text-[11px]
                text-[var(--text-primary)]
                hover:bg-[var(--bg-control-hover)]
            ">
                <Settings
                    size={15}
                    strokeWidth={1.8}
                    className="text-[var(--text-muted)]"
                />
                <span>Settings</span>
            </button>

            <div className="
                my-1
                border-t border-[var(--border)]
            " />

            <button className="
                flex w-full
                items-center
                gap-2.5
                rounded-md
                px-3 py-2.5
                text-left
                text-[11px]
                text-[var(--color-brand)]
                hover:bg-[var(--bg-control-hover)]
            ">
                <LogOut
                    size={15}
                    strokeWidth={1.8}
                    className="text-[var(--color-brand)]"
                />
                <span>Sign out</span>
            </button>
        </div>            
        
    </div>
  )
}
