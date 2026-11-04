import { resendVerification } from "../services/authService";
import { useContext, useState } from "react";
import { Link } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import Seo from "../components/Seo";
import { pageUrl } from "../utils/seo";

export default function RegisterPage() {
    const {
        register, //performs complete registeration process
    } = useContext(AuthContext);

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [registerError, setRegisterError] = useState("");
    // Issue #9: registration creates an unverified account and does not
    // log in. The page shows the check-email state for the registered
    // address instead of navigating to the reader. Submission state is
    // local: registration touches no AuthContext session state (issue
    // #8), so it must not borrow the context loading flag either.
    const [registeredEmail, setRegisteredEmail] = useState("");
    const [resendStatus, setResendStatus] = useState("idle");
    const [isSubmitting, setIsSubmitting] = useState(false);

    //when a form is submitted, the browser creates a submit event
    //and passes it to the handler
    const handleSubmit = async (event) => {
        //without this react state could reset and the app would refresh
        event.preventDefault(); //html forms normally submit to a server url and reload the page
        setRegisterError("");
        setIsSubmitting(true);

        try {
            const result = await register({
                firstName,
                lastName,
                email,
                password
            });

            if (result && result.email) {
                setRegisteredEmail(result.email);
                setResendStatus("idle");
            }
        } catch (error) {
            setRegisterError(error.message);
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleResend = async () => {
        setResendStatus("sending");
        try {
            await resendVerification(registeredEmail);
            setResendStatus("sent");
        } catch (error) {
            setResendStatus("error");
        }
    };

  return (
    <>
    {/* Authentication pages are never indexed. */}
    <Seo
        title="Create an account | Gnosis"
        description="Create a Gnosis account to save Bible study notes, bookmarks, and highlights."
        canonical={pageUrl("/register")}
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
                    to="/bible/Genesis/1"
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

        {/* registeration form */}
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
                            Create your account
                        </p>

                        <h1 className="
                            font-serif
                            text-[36px]
                            font-semibold
                            leading-tight
                            tracking-[-0.02em]
                            text-[var(--text-primary)]
                        ">
                            Begin your study.
                        </h1>

                        <p className="
                            mt-3
                            max-w-[360px]
                            text-[13px]
                            leading-6
                            text-[var(--text-muted)]
                        ">
                            Create an account to save your progress and personalize your study experience.
                        </p>

                        {registeredEmail ? (
                            <div className="
                                mt-7
                                space-y-5
                            ">
                                <p className="
                                    text-[14px]
                                    leading-6
                                    text-[var(--text-primary)]
                                ">
                                    Check your email to finish creating your account.
                                </p>

                                <p className="
                                    text-[13px]
                                    leading-6
                                    text-[var(--text-muted)]
                                ">
                                    We sent a verification link to{" "}
                                    <span className="
                                        font-semibold
                                        text-[var(--text-primary)]
                                    ">
                                        {registeredEmail}
                                    </span>
                                    . The link expires after 24 hours.
                                </p>

                                <p className="
                                    text-[13px]
                                    leading-6
                                    text-[var(--text-muted)]
                                ">
                                    If you requested more than one email, only the newest link works — use the most recent message.
                                </p>

                                {resendStatus === "sent" ? (
                                    <p className="
                                        text-[13px]
                                        leading-6
                                        text-[var(--text-muted)]
                                    ">
                                        If there is an unverified account for this email, a new verification link has been sent.
                                    </p>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleResend}
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
                                    </button>
                                )}

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

                                <p className="
                                    text-[13px]
                                    leading-6
                                    text-[var(--text-muted)]
                                ">
                                    Already verified?{" "}
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
                            </div>
                        ) : (
                        <form 
                        onSubmit={handleSubmit}
                        className="
                            mt-7
                            space-y-5
                        ">

                            <div className="
                                grid
                                grid-cols-2
                                gap-5
                            ">
                                <div>

                                    <label
                                        htmlFor="firstName"
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
                                        First name
                                    </label>

                                    <input
                                        id="firstName"
                                        type="text" 
                                        value={firstName}
                                        onChange={(event) => {
                                            setFirstName(event.target.value);
                                        }}
                                        autoComplete="given-name"
                                        required
                                        placeholder="First name"
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
                                        htmlFor="lastName"
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
                                        Last name
                                    </label>

                                    <input
                                        id="lastName"
                                        type="text" 
                                        value={lastName}
                                        onChange={(event) => {
                                            setLastName(event.target.value);
                                        }}
                                        autoComplete="family-name"
                                        required
                                        placeholder="Last name"
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

                                
                            </div>

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

                                <input
                                    id="password" 
                                    type="password"
                                    value={password}
                                    onChange={(event) => {
                                        setPassword(event.target.value);
                                    }}
                                    autoComplete="new-password"
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

                            {registerError && (
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
                                    {registerError}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={isSubmitting}
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
                                    {isSubmitting ? "Creating account..." : "Create account"}
                                </span>

                                {!isSubmitting && (
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
                        )}

                        <p className="
                            mt-8
                            border-t
                            border-[var(--border-control)]
                            pt-6
                            text-[12px]
                            text-[var(--text-muted)]
                        ">
                            Already have an account?{" "}

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
                </div>
            </div>

        </section>

    </main>
    </>
  )
}
