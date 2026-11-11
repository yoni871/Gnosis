import { resendVerification } from "../services/authService";
import { getReadingState } from "../services/readingStateService";
import { readingStateUrl } from "../utils/readingState";
import { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import Seo from "../components/Seo";
import PasswordInput from "../components/PasswordInput";
import { pageUrl } from "../utils/seo";

export default function LoginPage() {
    const {
        getAccessToken,
        login, //performs complete login process
        isAuthLoading //tells the from whether authentication is currently processing
    } = useContext(AuthContext);

    const navigate = useNavigate(); //function that changes routes

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loginError, setLoginError] = useState("");
    // Issue #9: when the backend reports an unverified account, the page
    // shows the resend panel for the attempted address instead of a
    // generic error. The branch is on the error CODE, never the text.
    const [unverifiedEmail, setUnverifiedEmail] = useState("");
    const [resendStatus, setResendStatus] = useState("idle");
    // Picking up where the reader stopped takes one extra round trip
    // after the profile lands; the button shows it instead of looking
    // finished while the reader is still being found.
    const [isResuming, setIsResuming] = useState(false);

    // After login, pick up where the reader stopped. A missing position
    // (404) or any failure to load it falls back to Genesis 1 — login
    // itself already succeeded, so a resume failure must not strand the
    // reader on the login page. Read the current in-memory credential after
    // login completes rather than the context snapshot from before submission.
    async function resumeUrl() {
        setIsResuming(true);
        try {
            const token = getAccessToken();
            if (!token) {
                return "/bible/Genesis/1";
            }
            const saved = await getReadingState(token);
            return saved ? readingStateUrl(saved) : "/bible/Genesis/1";
        } catch {
            return "/bible/Genesis/1";
        } finally {
            setIsResuming(false);
        }
    }

    //when a form is submitted, the browser creates a submit event
    //and passes it to the handler
    const handleSubmit = async (event) => {
        //without this react state could reset and the app would refresh
        event.preventDefault(); //html forms normally submit to a server url and reload the page
        setLoginError("");
        setUnverifiedEmail("");

        try {
            const profile = await login({
                email,
                password
            });

            // A null profile means this attempt was superseded by a
            // newer auth action (issue #6) — do not navigate for it.
            if (profile) {
                navigate(await resumeUrl());
            }
        } catch (error) {
            if (error.code === "EMAIL_NOT_VERIFIED") {
                setUnverifiedEmail(email);
                setResendStatus("idle");
            } else {
                setLoginError(error.message);
            }
        }
    }

    const handleResend = async () => {
        setResendStatus("sending");
        try {
            await resendVerification(unverifiedEmail);
            setResendStatus("sent");
        } catch (error) {
            setResendStatus("error");
        }
    };

  return (
    <>
    {/* Authentication pages are never indexed. */}
    <Seo
        title="Log in | Gnosis"
        description="Log in to Gnosis to access your Bible study notes, bookmarks, and highlights."
        canonical={pageUrl("/login")}
        robots="noindex, nofollow"
    />
    <main className="
        grid
        min-h-screen
        lg:grid-cols-[50%_50%]
        xl:grid-cols-[40%_60%]
    ">

        <section className="
            hidden
            border-r
            border-[var(--border-control)]
            lg:relative
            lg:flex
            lg:flex-col
            lg:px-16
            lg:py-14
        ">

            <div className="
                absolute
                left-16
                top-1/2
                w-[calc(100%-8rem)]
                max-w-[560px] 
                -translate-y-1/2
            ">

                <Link
                    to="/"
                    className="
                        mb-4
                        block
                        w-fit
                        font-serif
                        text-[clamp(58px,6vw,96px)]
                        font-bold
                        leading-[0.9]
                        tracking-[-0.05em]
                        text-[var(--color-brand)]
                    "
                >
                    Gnosis
                </Link>

                <p className="
                    mb-5
                    text-[12px]
                    font-semibold
                    uppercase
                    tracking-[0.22em]
                    text-[var(--color-brand)]
                ">
                    Scripture · Commentary · Study
                </p>
                <h1 className="
                    font-serif
                    text-[clamp(36px,3.5vw,56px)]
                    font-semibold
                    leading-[1.05]
                    tracking-[-0.02em]
                    text-[var(--text-primary)]
                ">
                    <span className="block whitespace-nowrap">
                        Study Scripture.
                    </span>

                    <span className="block whitespace-nowrap">
                        Understand deeply.
                    </span>

                </h1>

                <p className="
                    mt-6
                    max-w-[460px]
                    text-[15px]
                    leading-7
                    text-[var(--text-muted)]
                ">
                    Read Scripture alongside trusted commentary and 
                    build a deeper understanding of the biblical text.
                </p>

            </div>

            <p className="
                absolute
                bottom-14
                left-16
                font-serif
                text-[14px]
                italic
                text-[var(--text-muted)]
            ">
               γνῶσις · ἐπίγνωσις 
            </p>
        </section>

        {/* login form */}
        <section className="
            flex
            w-full
            items-center
            justify-center
            bg-[var(--bg-selected)]
            px-6
            py-12
            lg:px-12
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
                            Welcome back
                        </p>

                        <h1 className="
                            font-serif
                            text-[36px]
                            font-semibold
                            leading-tight
                            tracking-[-0.02em]
                            text-[var(--text-primary)]
                        ">
                            Continue your study.
                        </h1>

                        <p className="
                            mt-3
                            max-w-[360px]
                            text-[13px]
                            leading-6
                            text-[var(--text-muted)]
                        ">
                            Sign in to save your progress and personalize your study experience.
                        </p>

                        <form 
                        onSubmit={handleSubmit}
                        className="
                            mt-7
                            space-y-5
                        ">

                            <div>
                                <label 
                                htmlFor="email"
                                className="
                                    mb-1
                                    block
                                    text-[10px]
                                    font-semibold
                                    uppercase
                                    tracking-[0.14em]
                                    text-[var(--text-muted)]
                                ">
                                    Email address
                                </label>

                                <input
                                    id="email" 
                                    type="email"
                                    value={email}
                                    onChange={(event) => {
                                        setEmail(event.target.value);
                                        setUnverifiedEmail("");
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

                            <div>
                                <label 
                                htmlFor="password"
                                className="
                                    mb-1
                                    block
                                    text-[10px]
                                    font-semibold
                                    uppercase
                                    tracking-[0.14em]
                                    text-[var(--text-muted)]

                                ">
                                    Password
                                </label>

                                <PasswordInput
                                    id="password"
                                    value={password}
                                    onChange={(event) => {
                                        setPassword(event.target.value);
                                    }}
                                    autoComplete="current-password"
                                    required
                                    placeholder="Enter your password"
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

                            <p className="
                                text-right
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
                                    Forgot your password?
                                </Link>
                            </p>

                            {loginError && (
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
                                    {loginError}
                                </p>
                            )}

                            {unverifiedEmail && (
                                <div
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
                                    <p>
                                        Your email address is not verified yet. Check your inbox for the verification link.
                                    </p>
                                    <p className="mt-2">
                                        Verification links expire after 24 hours, and each new email replaces the last one — if you requested more than one, only the newest link works.
                                    </p>
                                    {resendStatus === "sent" ? (
                                        <p className="mt-3">
                                            If there is an unverified account for this email, a new verification link has been sent.
                                        </p>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={handleResend}
                                            disabled={resendStatus === "sending"}
                                            className="
                                                mt-3
                                                font-semibold
                                                underline
                                                decoration-[var(--border-control)]
                                                underline-offset-4
                                                transition
                                                hover:decoration-[var(--color-brand)]
                                                disabled:cursor-not-allowed
                                                disabled:opacity-60
                                            "
                                        >
                                            {resendStatus === "sending" ? "Sending..." : "Resend verification email"}
                                        </button>
                                    )}
                                    {resendStatus === "error" && (
                                        <p className="mt-2">
                                            Could not send a new link. Try again.
                                        </p>
                                    )}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isAuthLoading || isResuming}
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
                                    {isAuthLoading
                                        ? "Signing in..."
                                        : isResuming
                                            ? "Opening your place…"
                                            : "Sign in"}
                                </span>

                                {!isAuthLoading && (
                                    <span
                                        aria-hidden="true"
                                        className="
                                            text-[18px]
                                            font-normal
                                            transition-transform
                                            duration-200
                                            group-hover:translate-x-1
                                        "
                                    >
                                        →
                                    </span>
                                )}
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
                            Don&apos;t have an account? {" "}

                            <Link
                                to="/register"
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
                                Create one
                            </Link>
                        </p>

                        <p className="
                            mt-4
                            text-[12px]
                            text-[var(--text-muted)]
                        ">
                            <Link
                                to="/privacy"
                                className="
                                    underline
                                    decoration-[var(--border-control)]
                                    underline-offset-4
                                    transition
                                    hover:decoration-[var(--color-brand)]
                                "
                            >
                                Privacy Policy
                            </Link>
                        </p>

                </div>
            </div>

        </section>

    </main>
    </>
  )
}
