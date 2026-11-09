import { useContext, useState } from "react"
import {
    User,
    Settings,
    Shield,
    LogOut,
    ChevronDown,
    ChevronUp
} from "lucide-react"
import { Link } from "react-router-dom";
import useClickOutside from "../../hooks/useClickOutside";
import AuthContext from "../../context/AuthContext";

export default function ProfileMenu() {
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const {user, logout } = useContext(AuthContext);

    const profileRef = useClickOutside(() => {
        setIsProfileOpen(false)
    });

    const handleLogout = () => {
        logout();
        setIsProfileOpen(false);
    };

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
            aria-expanded={isProfileOpen}
            aria-controls="profile-options"
            onKeyDown={(event) => {
                if (event.key === "Escape") setIsProfileOpen(false);
            }}
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
                {`${user.first_name[0]}${user.last_name[0]}`}
            </div>

            <span className="
                whitespace-nowrap
                font-serif
                text-[10px]
                font-semibold
            ">
                {`${user.first_name} ${user.last_name}`}
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

        
        <div id="profile-options" hidden={!isProfileOpen}
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    setIsProfileOpen(false);
                    profileRef.current?.querySelector("button")?.focus();
                }
            }} className={`
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
                <Settings
                    size={15}
                    strokeWidth={1.8}
                    className="text-[var(--text-muted)]"
                />
                <span>Settings</span>
            </button>

            <Link
                to="/sessions"
                onClick={() => setIsProfileOpen(false)}
                className="
                    flex w-full
                    items-center
                    gap-2.5
                    rounded-md
                    px-3 py-2.5
                    text-left
                    text-[11px]
                    text-[var(--text-primary)]
                    hover:bg-[var(--bg-control-hover)]
                "
            >
                <Shield
                    size={15}
                    strokeWidth={1.8}
                    className="text-[var(--text-muted)]"
                />
                <span>Sessions &amp; password</span>
            </Link>

            <Link
                to="/login"
                onClick={handleLogout} 
                className="
                    flex w-full
                    items-center
                    gap-2.5
                    rounded-md
                    px-3 py-2.5
                    text-left
                    text-[11px]
                    text-[var(--color-brand)]
                    hover:bg-[var(--bg-control-hover)]
                "
            >
                <LogOut
                    size={15}
                    strokeWidth={1.8}
                    className="text-[var(--color-brand)]"
                />
                <span>
                    Sign out
                </span>
            </Link>
        </div>            
        
    </div>
  )
}
