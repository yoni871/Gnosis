import { Link } from "react-router-dom"

export default function AuthActions() {
  return (
        <div className="flex items-center">
            <Link
                to="/login"
                className="
                    flex h-[30px]
                    items-center justify-center
                    rounded-l-lg
                    border
                    border-r-0
                    border-[var(--color-brand)]
                    bg-transparent
                    px-3
                    font-serif
                    text-[9px]
                    font-semibold
                    text-[var(--color-brand)]
                    transition-all duration-200
                    hover:bg-[var(--hover-bg)]
                "
            >
                Sign in
            </Link>

            <Link
                to="/register"
                className="
                    flex h-[34px]
                    items-center justify-center
                    rounded-lg
                    border
                    border-[var(--color-brand)]
                    bg-[var(--color-brand)]
                    px-4
                    font-serif
                    text-[10px]
                    font-semibold
                    text-white
                    shadow-sm
                    transition-all duration-200
                    hover:bg-[var(--color-brand-dark)]
                "
            >
                Create account
            </Link>
        </div>          
    )
}
