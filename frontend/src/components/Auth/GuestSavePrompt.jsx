import AuthActions from "../Header/AuthActions";

export default function GuestSavePrompt({ onClose }) {
    return(
        <section
            aria-label="Save your bookmarks"
            className="
                fixed bottom-6 left-1/2 z-[100]
                w-[calc(100%-32px)] max-w-sm -translate-x-1/2
                rounded-xl
                border border-[var(--border)]
                bg-[var(--bg-panel)]
                p-5 shadow-lg
                max-[768px]:bottom-[65px]
            "
        >
            <h2 className="m-0 font-serif text-[18px] text-[var(--text-primary)]">
                Keep your bookmarks
            </h2>
            <p className="my-3 text-[13px] leading-relaxed text-[var(--text-muted)]">
                Your bookmark is available for now. Sign in or create an
                account to save bookmarks across visits. Guest bookmarks
                disappear when you refresh or leave the Study page. 
            </p>

            <AuthActions />

            <button
                type="button"
                onClick={onClose}
                className="
                mt-4 
                text-[12px] 
                text-[var(--text-muted)] 
                hover:underline
                cursor-pointer
                "
            >
                Continue as guest →
            </button>
        </section>
    );
}