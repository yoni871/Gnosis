import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { verifyEmail, resendVerification } from "../services/authService";

// Issue #9: the verification page.
//
// The token arrives in the URL fragment (/verify-email#token=...),
// which browsers never send to a server, so prefetchers and logs cannot
// consume it. The fragment is removed from the URL immediately on
// mount, the token is held only in component memory (never localStorage,
// sessionStorage, or a log), and nothing is submitted until the user
// clicks the confirmation button.
export default function VerifyPage() {
    const [token] = useState(() => {
        const match = window.location.hash.match(/^#token=([A-Za-z0-9_-]+)$/);
        return match ? match[1] : null;
    });
    const [status, setStatus] = useState(() => {
        const match = window.location.hash.match(/^#token=([A-Za-z0-9_-]+)$/);
        return match ? "confirm" : "invalid";
    });
    const [resendEmail, setResendEmail] = useState("");
    const [resendStatus, setResendStatus] = useState("idle");

    useEffect(() => {
        // Drop the fragment right away: the token must not linger in
        // the URL, the history entry, or any referrer.
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }, []);

    const handleConfirm = async () => {
        setStatus("verifying");
        try {
            await verifyEmail(token);
            setStatus("success");
        } catch (error) {
            setStatus("invalid");
        }
    };

    const handleResend = async (event) => {
        event.preventDefault();
        setResendStatus("sending");
        try {
            await resendVerification(resendEmail);
            setResendStatus("sent");
        } catch (error) {
            setResendStatus("error");
        }
    };

    return (
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
                        Email verification
                    </p>

                    {status === "confirm" && (
                        <>
                            <h1 className="
                                font-serif
                                text-[36px]
                                font-semibold
                                leading-tight
                                tracking-[-0.02em]
                                text-[var(--text-primary)]
                            ">
                                Verify your email address.
                            </h1>

                            <p className="
                                mt-3
                                max-w-[360px]
                                text-[13px]
                                leading-6
                                text-[var(--text-muted)]
                            ">
                                Click below to confirm this email address for your Gnosis account. This link expires after 24 hours.
                            </p>

                            <button
                                type="button"
                                onClick={handleConfirm}
                                className="
                                    group
                                    mt-7
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
                                    Verify my email
                                </span>
                                <span aria-hidden="true" className="text-[18px] font-normal">→</span>
                            </button>
                        </>
                    )}

                    {status === "verifying" && (
                        <p className="
                            mt-3
                            text-[13px]
                            leading-6
                            text-[var(--text-muted)]
                        ">
                            Verifying...
                        </p>
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
                                Your email is verified.
                            </h1>

                            <p className="
                                mt-3
                                max-w-[360px]
                                text-[13px]
                                leading-6
                                text-[var(--text-muted)]
                            ">
                                You can now sign in to your Gnosis account.
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
                                Verification links expire after 24 hours, and each new email replaces the last one — if you requested more than one, only the newest link works.
                            </p>

                            {resendStatus === "sent" ? (
                                <p className="
                                    mt-7
                                    text-[13px]
                                    leading-6
                                    text-[var(--text-muted)]
                                ">
                                    If there is an unverified account for this email, a new verification link has been sent.
                                </p>
                            ) : (
                                <form
                                    onSubmit={handleResend}
                                    className="
                                        mt-7
                                        space-y-5
                                    "
                                >
                                    <div>
                                        <label
                                            htmlFor="resend-email"
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
                                            id="resend-email"
                                            type="email"
                                            value={resendEmail}
                                            onChange={(event) => {
                                                setResendEmail(event.target.value);
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
                                                text-[16px]
                                                text-[var(--text-primary)]
                                                outline-none
                                                transition-colors
                                                placeholder:text-[var(--text-muted)]
                                                focus:border-[var(--color-brand)]
                                                focus:ring-0
                                            "
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={resendStatus === "sending"}
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
                                            {resendStatus === "sending" ? "Sending..." : "Resend verification email"}
                                        </span>
                                        <span aria-hidden="true" className="text-[18px] font-normal">→</span>
                                    </button>

                                    {resendStatus === "error" && (
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
                                            Could not send a new link. Try again.
                                        </p>
                                    )}
                                </form>
                            )}
                        </>
                    )}
                </div>
            </div>
        </main>
    );
}
