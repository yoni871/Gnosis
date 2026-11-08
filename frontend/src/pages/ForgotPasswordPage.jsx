import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../services/authService";
import Seo from "../components/Seo";
import { pageUrl } from "../utils/seo";

// Issue #10: the forgot-password page.
//
// The user enters an email address and the server sends a reset link
// — or does nothing at all, if there is no verified account for it.
// Either way this page shows the same generic message, so it can never
// be used to probe whether an address has an account.
export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState("idle");
    const [error, setError] = useState("");

    const handleSubmit = async (event) => {
        event.preventDefault();
        setStatus("sending");
        setError("");
        try {
            await forgotPassword(email);
            setStatus("sent");
        } catch (err) {
            setStatus("idle");
            // Rate limiting is the only client-visible failure that
            // carries a useful message; anything else is a generic
            // retry prompt. The message never says whether an account
            // exists.
            setError(err.code === "RATE_LIMITED"
                ? err.message
                : "Could not send a password reset link. Try again.");
        }
    };

    return (
        <>
        {/* Authentication pages are never indexed. */}
        <Seo
            title="Reset your password | Gnosis"
            description="Request a password reset link for your Gnosis account."
            canonical={pageUrl("/forgot-password")}
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

                    {status === "sent" ? (
                        <>
                            <h1 className="
                                font-serif
                                text-[36px]
                                font-semibold
                                leading-tight
                                tracking-[-0.02em]
                                text-[var(--text-primary)]
                            ">
                                Check your email.
                            </h1>

                            <p className="
                                mt-3
                                max-w-[360px]
                                text-[13px]
                                leading-6
                                text-[var(--text-muted)]
                            ">
                                If there is an account for this email, a password reset link has been sent. The link expires after 1 hour and works only once.
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
                                    Back to sign in
                                </Link>
                            </p>
                        </>
                    ) : (
                        <>
                            <h1 className="
                                font-serif
                                text-[36px]
                                font-semibold
                                leading-tight
                                tracking-[-0.02em]
                                text-[var(--text-primary)]
                            ">
                                Reset your password.
                            </h1>

                            <p className="
                                mt-3
                                max-w-[360px]
                                text-[13px]
                                leading-6
                                text-[var(--text-muted)]
                            ">
                                Enter the email address for your Gnosis account and we will send you a link to choose a new password.
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
                                        htmlFor="forgot-email"
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
                                        Email address
                                    </label>

                                    <input
                                        id="forgot-email"
                                        type="email"
                                        value={email}
                                        onChange={(event) => {
                                            setEmail(event.target.value);
                                        }}
                                        autoComplete="email"
                                        required
                                        placeholder="you@example.com"
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
                                    disabled={status === "sending"}
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
                                        {status === "sending" ? "Sending..." : "Send reset link"}
                                    </span>
                                    <span aria-hidden="true" className="text-[18px] font-normal">→</span>
                                </button>
                            </form>

                            <p className="
                                mt-8
                                border-t
                                border-[var(--border-control)]
                                pt-6
                                text-[12px]
                                text-[var(--text-muted)]
                            ">
                                Remembered your password? {" "}

                                <Link
                                    to="/login"
                                    className="
                                        ml-1
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
                </div>
            </div>
        </main>
        </>
    );
}
