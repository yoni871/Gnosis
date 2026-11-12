// Two-factor authentication controls, rendered inside Settings
// under Account → Security (roadmap T2.1–T2.3). This used to be the
// standalone /mfa page; it moved here so MFA lives with the rest of
// the account settings. The behavior is unchanged — enrollment is
// two steps (start, then confirm with a valid code), recovery codes
// are shown exactly once (at enrollment or regeneration), and
// disabling needs the password plus a current authenticator code
// or a recovery code. Turning MFA off also revokes every other
// session; the device that turned it off stays signed in.
import { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import PasswordInput from "./PasswordInput";
import {
    getMfaStatus,
    startMfaEnrollment,
    confirmMfaEnrollment,
    regenerateRecoveryCodes,
    disableMfa,
} from "../services/mfaService";

const inputClass = `
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
`;

const labelClass = `
    mb-1
    block
    text-[10px]
    font-semibold
    uppercase
    tracking-[0.14em]
    text-[var(--text-muted)]
`;

const buttonClass = `
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
`;

export default function MfaSettings() {
    const { user, getAccessToken, isAuthenticated, isAuthLoading } = useContext(AuthContext);

    const [loading, setLoading] = useState(true);
    const [enrolled, setEnrolled] = useState(false);
    const [enroll, setEnroll] = useState(null);
    const [confirmCode, setConfirmCode] = useState("");
    const [recoveryCodes, setRecoveryCodes] = useState(null);
    const [regenPassword, setRegenPassword] = useState("");
    const [regenCode, setRegenCode] = useState("");
    const [disablePassword, setDisablePassword] = useState("");
    const [disableCode, setDisableCode] = useState("");
    const [copied, setCopied] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    useEffect(() => {
        if (isAuthLoading) return;
        if (!isAuthenticated) {
            setLoading(false);
            return;
        }
        let active = true;
        getMfaStatus(getAccessToken())
            .then((status) => {
                if (active) {
                    setEnrolled(status.enrolled);
                    setLoading(false);
                }
            })
            .catch((err) => {
                if (active) {
                    setError(err.message);
                    setLoading(false);
                }
            });
        return () => { active = false; };
    }, [isAuthLoading, isAuthenticated, getAccessToken]);

    const token = () => getAccessToken();

    async function handleStart(event) {
        event.preventDefault();
        setError("");
        setNotice("");
        setBusy(true);
        try {
            setEnroll(await startMfaEnrollment(token()));
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    async function handleConfirm(event) {
        event.preventDefault();
        setError("");
        setNotice("");
        setBusy(true);
        try {
            const result = await confirmMfaEnrollment(token(), confirmCode);
            setEnrolled(true);
            setEnroll(null);
            setConfirmCode("");
            setRecoveryCodes(result.recoveryCodes);
            setNotice("Two-factor authentication is on. Save your recovery codes below — they are shown only once.");
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    async function handleRegenerate(event) {
        event.preventDefault();
        setError("");
        setNotice("");
        setBusy(true);
        try {
            const result = await regenerateRecoveryCodes(token(), regenPassword, regenCode);
            setRegenPassword("");
            setRegenCode("");
            setRecoveryCodes(result.recoveryCodes);
            setNotice("New recovery codes issued. The old ones no longer work — save these now, they are shown only once.");
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    async function handleDisable(event) {
        event.preventDefault();
        setError("");
        setNotice("");
        setBusy(true);
        try {
            await disableMfa(token(), disablePassword, disableCode);
            setEnrolled(false);
            setDisablePassword("");
            setDisableCode("");
            setNotice("Two-factor authentication is off. You can set it up again any time.");
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    async function handleCopySecret() {
        try {
            await navigator.clipboard.writeText(enroll.secret);
            setCopied(true);
        } catch {
            setCopied(false);
        }
    }

    if (isAuthLoading || loading) {
        return <p role="status" className="mt-2 text-[14px] text-[var(--text-muted)]">Loading…</p>;
    }

    if (!isAuthenticated) {
        return (
            <p className="mt-2 text-[14px] text-[var(--text-muted)]">
                <Link to="/login" className="font-semibold text-[var(--color-brand)] underline underline-offset-4">
                    Sign in
                </Link>{" "}
                to manage two-factor authentication.
            </p>
        );
    }

    return (
        <div className="space-y-8">
            {error && (
                <p role="alert" className="rounded-lg border border-[var(--color-brand)] bg-[var(--bg-selected)] px-3 py-2.5 text-[11px] leading-5 text-[var(--color-brand)]">
                    {error}
                </p>
            )}
            {notice && (
                <p role="status" className="rounded-lg border border-[var(--border-control)] bg-[var(--bg-selected)] px-3 py-2.5 text-[11px] leading-5 text-[var(--text-primary)]">
                    {notice}
                </p>
            )}

            {recoveryCodes && (
                <section aria-label="Recovery codes">
                    <h2 className="font-serif text-[20px] font-semibold text-[var(--text-primary)]">
                        Recovery codes — save these now
                    </h2>
                    <p className="mt-2 text-[13px] leading-6 text-[var(--text-muted)]">
                        Each code works once, in place of an authenticator code. They are shown
                        only this once — store them somewhere safe, separate from your password.
                    </p>
                    <ul className="mt-4 space-y-1 rounded-lg border border-[var(--border-control)] px-4 py-3 font-mono text-[14px] tracking-wider text-[var(--text-primary)]">
                        {recoveryCodes.map((code) => (
                            <li key={code}>{code}</li>
                        ))}
                    </ul>
                    <button
                        type="button"
                        onClick={() => setRecoveryCodes(null)}
                        className="mt-4 font-semibold text-[12px] text-[var(--color-brand)] underline decoration-[var(--border-control)] underline-offset-4 transition hover:decoration-[var(--color-brand)]"
                    >
                        I&apos;ve saved my recovery codes
                    </button>
                </section>
            )}

            {!enrolled && !enroll && (
                <section>
                    <h2 className="font-serif text-[20px] font-semibold text-[var(--text-primary)]">
                        Two-factor authentication is off
                    </h2>
                    <p className="mt-2 text-[13px] leading-6 text-[var(--text-muted)]">
                        Add a second step to signing in: a 6-digit code from an authenticator
                        app, with single-use recovery codes as a backup. Setting it up takes
                        a minute: add the secret to your authenticator app, then confirm with
                        a code from the app.
                    </p>
                    <form onSubmit={handleStart} className="mt-5">
                        <button type="submit" disabled={busy} className={buttonClass}>
                            <span>{busy ? "Starting…" : "Set up two-factor authentication"}</span>
                            <span aria-hidden="true" className="text-[18px] font-normal">→</span>
                        </button>
                    </form>
                </section>
            )}

            {!enrolled && enroll && (
                <section>
                    <h2 className="font-serif text-[20px] font-semibold text-[var(--text-primary)]">
                        Add Gnosis to your authenticator app
                    </h2>
                    <p className="mt-2 text-[13px] leading-6 text-[var(--text-muted)]">
                        Open your authenticator app and add this account manually with the secret
                        below. No QR code is shown yet — type the secret in exactly as written.
                    </p>
                    <p className="mt-4 text-[13px] leading-6 text-[var(--text-muted)]">
                        Account: <span className="font-semibold text-[var(--text-primary)]">{user ? user.email : ""}</span>
                    </p>
                    <div className="mt-3 flex items-center gap-3 rounded-lg border border-[var(--border-control)] px-4 py-3">
                        <code className="flex-1 break-all font-mono text-[14px] tracking-wider text-[var(--text-primary)]">
                            {enroll.secret}
                        </code>
                        <button
                            type="button"
                            onClick={handleCopySecret}
                            className="shrink-0 font-semibold text-[12px] text-[var(--color-brand)] underline underline-offset-4"
                        >
                            {copied ? "Copied" : "Copy"}
                        </button>
                    </div>
                    <p className="mt-3 break-all text-[11px] leading-5 text-[var(--text-muted)]">
                        Setup link: {enroll.otpauthUrl}
                    </p>
                    <form onSubmit={handleConfirm} className="mt-6 space-y-5">
                        <div>
                            <label htmlFor="mfa-confirm-code" className={labelClass}>
                                Code from your authenticator app
                            </label>
                            <input
                                id="mfa-confirm-code"
                                type="text"
                                inputMode="numeric"
                                value={confirmCode}
                                onChange={(event) => setConfirmCode(event.target.value)}
                                autoComplete="one-time-code"
                                required
                                placeholder="6-digit code"
                                className={inputClass}
                            />
                        </div>
                        <button type="submit" disabled={busy} className={buttonClass}>
                            <span>{busy ? "Confirming…" : "Confirm and turn on"}</span>
                            <span aria-hidden="true" className="text-[18px] font-normal">→</span>
                        </button>
                    </form>
                    <p className="mt-4 text-[12px] leading-5 text-[var(--text-muted)]">
                        Nothing is turned on until the code checks out — an abandoned setup leaves
                        your account exactly as it was.
                    </p>
                </section>
            )}

            {enrolled && (
                <>
                <section>
                    <h2 className="font-serif text-[20px] font-semibold text-[var(--text-primary)]">
                        Two-factor authentication is on
                    </h2>
                    <p className="mt-2 text-[13px] leading-6 text-[var(--text-muted)]">
                        Signing in now asks for a code from your authenticator app after your
                        password. Lost your device? A recovery code signs you in instead.
                    </p>
                </section>

                <section>
                    <h2 className="font-serif text-[20px] font-semibold text-[var(--text-primary)]">
                        New recovery codes
                    </h2>
                    <p className="mt-2 text-[13px] leading-6 text-[var(--text-muted)]">
                        Issues ten fresh codes and invalidates the old set immediately. Needs
                        your password and a current authenticator code.
                    </p>
                    <form onSubmit={handleRegenerate} className="mt-5 space-y-5">
                        <div>
                            <label htmlFor="mfa-regen-password" className={labelClass}>
                                Password
                            </label>
                            <PasswordInput
                                id="mfa-regen-password"
                                value={regenPassword}
                                onChange={(event) => setRegenPassword(event.target.value)}
                                autoComplete="current-password"
                                required
                                placeholder="Enter your password"
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label htmlFor="mfa-regen-code" className={labelClass}>
                                Code from your authenticator app
                            </label>
                            <input
                                id="mfa-regen-code"
                                type="text"
                                inputMode="numeric"
                                value={regenCode}
                                onChange={(event) => setRegenCode(event.target.value)}
                                autoComplete="one-time-code"
                                required
                                placeholder="6-digit code"
                                className={inputClass}
                            />
                        </div>
                        <button type="submit" disabled={busy} className={buttonClass}>
                            <span>{busy ? "Issuing…" : "Issue new recovery codes"}</span>
                            <span aria-hidden="true" className="text-[18px] font-normal">→</span>
                        </button>
                    </form>
                </section>

                <section>
                    <h2 className="font-serif text-[20px] font-semibold text-[var(--text-primary)]">
                        Turn off two-factor authentication
                    </h2>
                    <p className="mt-2 text-[13px] leading-6 text-[var(--text-muted)]">
                        Needs your password and a current authenticator code — or a recovery
                        code. Turning it off also invalidates your remaining recovery codes
                        and signs you out everywhere else.
                    </p>
                    <form onSubmit={handleDisable} className="mt-5 space-y-5">
                        <div>
                            <label htmlFor="mfa-disable-password" className={labelClass}>
                                Password
                            </label>
                            <PasswordInput
                                id="mfa-disable-password"
                                value={disablePassword}
                                onChange={(event) => setDisablePassword(event.target.value)}
                                autoComplete="current-password"
                                required
                                placeholder="Enter your password"
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label htmlFor="mfa-disable-code" className={labelClass}>
                                Authenticator code or recovery code
                            </label>
                            <input
                                id="mfa-disable-code"
                                type="text"
                                value={disableCode}
                                onChange={(event) => setDisableCode(event.target.value)}
                                autoComplete="one-time-code"
                                required
                                placeholder="6-digit code or recovery code"
                                className={inputClass}
                            />
                        </div>
                        <button type="submit" disabled={busy} className={buttonClass}>
                            <span>{busy ? "Turning off…" : "Turn off two-factor authentication"}</span>
                            <span aria-hidden="true" className="text-[18px] font-normal">→</span>
                        </button>
                    </form>
                </section>
                </>
            )}
        </div>
    );
}
