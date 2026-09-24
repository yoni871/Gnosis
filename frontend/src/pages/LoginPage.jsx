import { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthContext from "../context/AuthContext";

export default function LoginPage() {
    const {
        login, //performs complete login process
        isAuthLoading //tells the from whether authentication is currently processing
    } = useContext(AuthContext);

    const navigate = useNavigate(); //function that changes routes

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loginError, setLoginError] = useState("");

    //when a form is submitted, the browser creates a submit event
    //and passes it to the handler
    const handleSubmit = async (event) => {
        //without this react state could reset and the app would refresh
        event.preventDefault(); //html forms normally submit to a server url and reload the page
        setLoginError("");

        try {
            await login({
                email,
                password
            });
            
            navigate("/bible/Genesis/1");
        } catch (error) {
            setLoginError(error.message);
        }
    }

  return (
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

                            <button
                                type="submit"
                                disabled={isAuthLoading}
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
                                    {isAuthLoading ? "Signing in..." : "Sign in"}
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

                </div>
            </div>

        </section>

    </main>
  )
}
