import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { resetPassword } from "../services/authService";
import Seo from "../components/Seo";
import { pageUrl } from "../utils/seo";

// Issue #10: the reset-password page.
//
// The token arrives in the URL fragment (/reset-password#token=...),
// which browsers never send to a server, so prefetchers and logs cannot
// consume it. The fragment is removed from the URL immediately on
// mount, the token is held only in component memory (never localStorage,
// sessionStorage, or a log), and nothing is submitted until the user
// fills in a new password and clicks the reset button.
export default function ResetPasswordPage() {
    const [token] = useState(() => {
        const match = window.location.hash.match(/^#token=([A-Za-z0-9_-]+)$/);
        return match ? match[1] : null;
    });
    const [status, setStatus] = useState(() => {
        const match = window.location.hash.match(/^#token=([A-Za-z0-9_-]+)$/);
        return match ? "form" : "invalid";
    });
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        // Drop the fragment right away: the token must not linger in
        // the URL, the history entry, or any referrer.
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }, []);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");
        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }
        setStatus("submitting");
        try {
            await resetPassword(token, password);
            setStatus("success");
        } catch (err) {
            if (err.code === "INVALID_RESET_LINK") {
                setStatus("invalid");
            } else {
                // Validation failures (for example a password shorter
                // than 8 characters) carry the backend's message; anything
                // else is a generic retry prompt.
                setError(err.code === "VALIDATION_FAILED"
                    ? err.message
                    : "Could not reset your password. Try again.");
                setStatus("form");
            }
        }
    };

    return (
        <>
        {/* Authentication pages are never indexed. */}
        <Seo
            title="Choose a new password | Gnosis"
            description="Choose a new password for your Gnosis account."
            canonical={pageUrl("/reset-password")}
            robots="noindex, nofollow"
        />
        <main className="
            flex
            min-h-screen
            items-center
            justify-center
            bg-[var(--bg-selected)]
            px-6
            py-12
        ">
            <div className="w-full max-w-[440px]">
                <div className="
                    w-full
                    px-2
                    py-8
                    sm:px-6
                ">
                    <p className="
                        mb-3
                        text-[11px]
                        font-semibold
                        uppercase
                        tracking-[0.2rem]
                        text-[var(--color-brand)]
                    ">
                        Password reset
                    </p>

                    {status === "form" && (
                        <>
                            <h1 className="
                                font-serif
                                text-[36px]
                                font-semibold
                                leading-tight
                                tracking-[-0.02em]
                                text-[var(--text-primary)]
                            ">
                                Choose a new password.
                            </h1>

                            <p className="
                                mt-3
                                max-w-[360px]
                                text-[13px]
                                leading-6
                                text-[var(--text-muted)]
                            ">
                                Your new password must be at least 8 characters. This link expires after 1 hour and works only once.
                            </p>

                            <form
                                onSubmit={handleSubmit}
                                className="
                                    mt-7
                                    space-y-5
                                "
                            >
                                <div>
                                    <label
                                        htmlFor="reset-password"
                                        className="
                                            mb-1
                                            block
                                            text-[10px]
                                            font-semibold
                                            uppercase
                                            tracking-[0.14em]
                                            text-[var(--text-muted)]
                                        "
                                    >
                                        New password
                                    </label>

                                    <input
                                        id="reset-password"
                                        type="password"
                                        value={password}
                                        onChange={(event) => {
                                            setPassword(event.target.value);
                                        }}
                                        autoComplete="new-password"
                                        required
                                        placeholder="Enter a new password"
                                        className="
                                            h-12
                                            w-full
                                            border-0
                                            border-b
                                            border-[var(--border-control)]
                                            bg-transparent
                                            px-0
                                            text-[14px]
                                            text-[var(--text-primary)]
                                            outline-none
                                            transition-colors
                                            placeholder:text-[var(--text-muted)]
                                            focus:border-[var(--color-brand)]
                                            focus:ring-0
                                        "
                                    />
                                </div>

                                <div>
                                    <label
                                        htmlFor="reset-password-confirm"
                                        className="
                                            mb-1
                                            block
                                            text-[10px]
                                            font-semibold
                                            uppercase
                                            tracking-[0.14em]
                                            text-[var(--text-muted)]
                                        "
                                    >
                                        Confirm new password
                                    </label>

                                    <input
                                        id="reset-password-confirm"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(event) => {
                                            setConfirmPassword(event.target.value);
                                        }}
                                        autoComplete="new-password"
                                        required
                                        placeholder="Enter the new password again"
                                        className="
                                            h-12
                                            w-full
                                            border-0
                                            border-b
                                            border-[var(--border-control)]
                                            bg-transparent
                                            px-0
                                            text-[14px]
                                            text-[var(--text-primary)]
                                            outline-none
                                            transition-colors
                                            placeholder:text-[var(--text-muted)]
                                            focus:border-[var(--color-brand)]
                                            focus:ring-0
                                        "
                                    />
                                </div>

                                {error && (
                                    <p
                                        role="alert"
                                        className="
                                            rounded-lg
                                            border
                                            border-[var(--color-brand)]
                                            bg-[var(--bg-selected)]
                                            px-3
                                            py-2.5
                                            text-[11px]
                                            leading-5
                                            text-[var(--color-brand)]
                                        "
                                    >
                                        {error}
                                    </p>
                                )}

                                <button
                                    type="submit"
                                    disabled={status === "submitting"}
                                    className="
                                        group
                                        mt-2
                                        flex
                                        h-12
                                        w-full
                                        items-center
                                        justify-between
                                        border
                                        border-[var(--color-brand)]
                                        bg-[var(--color-brand)]
                                        px-5
                                        text-[12px]
                                        font-semibold
                                        tracking-wide
                                        text-white
                                        transition-all
                                        duration-200
                                        hover:bg-transparent
                                        hover:text-[var(--color-brand)]
                                        disabled:cursor-not-allowed
                                        disabled:opacity-60
                                    "
                                >
                                    <span>
                                        {status === "submitting" ? "Resetting..." : "Reset my password"}
                                    </span>
                                    <span aria-hidden="true" className="text-[18px] font-normal">→</span>
                                </button>
                            </form>
                        </>
                    )}

                    {status === "success" && (
                        <>
                            <h1 className="
                                font-serif
                                text-[36px]
                                font-semibold
                                leading-tight
                                tracking-[-0.02em]
                                text-[var(--text-primary)]
                            ">
                                Your password has been reset.
                            </h1>

                            <p className="
                                mt-3
                                max-w-[360px]
                                text-[13px]
                                leading-6
                                text-[var(--text-muted)]
                            ">
                                You can now sign in with your new password.
                            </p>

                            <p className="
                                mt-7
                                text-[12px]
                                text-[var(--text-muted)]
                            ">
                                <Link
                                    to="/login"
                                    className="
                                        font-semibold
                                        text-[var(--color-brand)]
                                        underline
                                        decoration-[var(--border-control)]
                                        underline-offset-4
                                        transition
                                        hover:decoration-[var(--color-brand)]
                                    "
                                >
                                    Sign in
                                </Link>
                            </p>
                        </>
                    )}

                    {status === "invalid" && (
                        <>
                            <h1 className="
                                font-serif
                                text-[36px]
                                font-semibold
                                leading-tight
                                tracking-[-0.02em]
                                text-[var(--text-primary)]
                            ">
                                This link is invalid or expired.
                            </h1>

                            <p className="
                                mt-3
                                max-w-[360px]
                                text-[13px]
                                leading-6
                                text-[var(--text-muted)]
                            ">
                                Password reset links expire after 1 hour and work only once — if you requested more than one, only the newest link works.
                            </p>

                            <p className="
                                mt-7
                                text-[12px]
                                text-[var(--text-muted)]
                            ">
                                <Link
                                    to="/forgot-password"
                                    className="
                                        font-semibold
                                        text-[var(--color-brand)]
                                        underline
                                        decoration-[var(--border-control)]
                                        underline-offset-4
                                        transition
                                        hover:decoration-[var(--color-brand)]
                                    "
                                >
                                    Request a new reset link
                                </Link>
                            </p>
                        </>
                    )}
                </div>
            </div>
        </main>
        </>
    );
}
