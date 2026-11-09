import { useContext, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import { getSessions, revokeSession, changePassword } from "../services/authService";
import Seo from "../components/Seo";
import { pageUrl } from "../utils/seo";

// Session/device management (T2.5): a standalone /sessions page linked
// from the account menu. It lists the user's sessions and offers an
// authenticated password change. This page moves into Settings when
// PR #89 (privacy-deletion) lands; until then it is the account
// surface for sessions and password.
//
// The session rows record no device metadata (no user agent, no IP),
// so a session is shown by when it was created and when it expires;
// the current session is the one whose id matches the access token's
// sid, derived client-side from the listed id, never from stored data.
function formatDate(value) {
    return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function SessionsPage() {
    const { user, token, isAuthenticated, isAuthLoading, logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const [sessions, setSessions] = useState(null);
    const [loadError, setLoadError] = useState("");
    const [revokingId, setRevokingId] = useState(null);
    const [revokeError, setRevokeError] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [passwordSuccess, setPasswordSuccess] = useState("");
    const [changing, setChanging] = useState(false);

    useEffect(() => {
        if (!token) return;
        let active = true;
        setLoadError("");
        getSessions(token).then((data) => {
            if (!active) return;
            setSessions(data.sessions);
        }).catch((error) => {
            if (!active) return;
            setLoadError(error.message || "Could not load your sessions. Try again.");
        });
        return () => { active = false; };
    }, [token]);

    if (isAuthLoading) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[var(--bg-selected)] px-6 py-12">
                <p className="text-[13px] text-[var(--text-muted)]">Loading…</p>
            </main>
        );
    }
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    const reload = async () => {
        const data = await getSessions(token);
        setSessions(data.sessions);
    };

    const handleRevoke = async (session) => {
        setRevokeError("");
        setRevokingId(session.id);
        try {
            await revokeSession(token, session.id);
            if (session.current) {
                // Revoking the current session is a logout: clear local
                // state and send the user to sign in again.
                logout();
                navigate("/login");
                return;
            }
            await reload();
        } catch (error) {
            setRevokeError(error.message || "Could not revoke the session. Try again.");
        } finally {
            setRevokingId(null);
        }
    };

    const handleChangePassword = async (event) => {
        event.preventDefault();
        setPasswordError("");
        setPasswordSuccess("");
        if (newPassword !== confirmPassword) {
            setPasswordError("New passwords do not match.");
            return;
        }
        setChanging(true);
        try {
            await changePassword(token, { currentPassword, newPassword });
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setPasswordSuccess("Your password has been changed. Other devices have been signed out.");
        } catch (error) {
            // Validation failures carry the backend's message; anything
            // else is a generic retry prompt.
            setPasswordError(error.code === "VALIDATION_FAILED"
                ? error.message
                : "Could not change your password. Try again.");
        } finally {
            setChanging(false);
        }
    };

    return (
        <>
        {/* Authentication pages are never indexed. */}
        <Seo
            title="Sessions & password | Gnosis"
            description="Review your signed-in sessions and change your Gnosis password."
            canonical={pageUrl("/sessions")}
            robots="noindex, nofollow"
        />
        <main className="
            flex
            min-h-screen
            justify-center
            bg-[var(--bg-selected)]
            px-6
            py-12
        ">
            <div className="w-full max-w-[560px]">
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
                        Account
                    </p>

                    <h1 className="
                        font-serif
                        text-[36px]
                        font-semibold
                        leading-tight
                        tracking-[-0.02em]
                        text-[var(--text-primary)]
                    ">
                        Sessions &amp; password.
                    </h1>

                    <p className="
                        mt-3
                        max-w-[440px]
                        text-[13px]
                        leading-6
                        text-[var(--text-muted)]
                    ">
                        Signed in as {user.email}. Revoking a session signs that device out immediately.
                    </p>

                    <h2 className="
                        mt-10
                        text-[12px]
                        font-semibold
                        uppercase
                        tracking-[0.14em]
                        text-[var(--text-muted)]
                    ">
                        Your sessions
                    </h2>

                    {loadError && (
                        <p role="alert" className="
                            mt-4
                            rounded-lg
                            border
                            border-[var(--color-brand)]
                            bg-[var(--bg-selected)]
                            px-3
                            py-2.5
                            text-[11px]
                            leading-5
                            text-[var(--color-brand)]
                        ">
                            {loadError}
                        </p>
                    )}

                    {sessions === null && !loadError && (
                        <p className="mt-4 text-[13px] text-[var(--text-muted)]">Loading sessions…</p>
                    )}

                    {sessions !== null && sessions.length === 0 && (
                        <p className="mt-4 text-[13px] text-[var(--text-muted)]">No sessions found.</p>
                    )}

                    {sessions !== null && sessions.length > 0 && (
                        <ul className="mt-4 space-y-3">
                            {sessions.map((session) => (
                                <li key={session.id} className="
                                    rounded-xl
                                    border
                                    border-[var(--border)]
                                    bg-[var(--bg-panel)]
                                    px-4
                                    py-3
                                ">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                                                Signed in {formatDate(session.createdAt)}
                                            </p>
                                            <p className="mt-1 text-[12px] leading-5 text-[var(--text-muted)]">
                                                Expires {formatDate(session.expiresAt)}
                                            </p>
                                            <p className="mt-1 flex gap-2 text-[11px]">
                                                {session.current && (
                                                    <span className="
                                                        rounded-full
                                                        bg-[var(--color-brand)]
                                                        px-2
                                                        py-0.5
                                                        font-semibold
                                                        text-white
                                                    ">
                                                        This device
                                                    </span>
                                                )}
                                                {session.revokedAt && (
                                                    <span className="
                                                        rounded-full
                                                        border
                                                        border-[var(--border)]
                                                        px-2
                                                        py-0.5
                                                        text-[var(--text-muted)]
                                                    ">
                                                        Revoked {formatDate(session.revokedAt)}
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                        {!session.revokedAt && (
                                            <button
                                                type="button"
                                                disabled={revokingId === session.id}
                                                onClick={() => handleRevoke(session)}
                                                className="
                                                    shrink-0
                                                    rounded-lg
                                                    border
                                                    border-[var(--border-control)]
                                                    px-3
                                                    py-2
                                                    text-[11px]
                                                    font-semibold
                                                    text-[var(--text-primary)]
                                                    transition-colors
                                                    hover:border-[var(--color-brand)]
                                                    hover:text-[var(--color-brand)]
                                                    disabled:cursor-not-allowed
                                                    disabled:opacity-60
                                                "
                                            >
                                                {session.current ? "Sign out of this device" : "Revoke"}
                                            </button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    {revokeError && (
                        <p role="alert" className="
                            mt-4
                            rounded-lg
                            border
                            border-[var(--color-brand)]
                            bg-[var(--bg-selected)]
                            px-3
                            py-2.5
                            text-[11px]
                            leading-5
                            text-[var(--color-brand)]
                        ">
                            {revokeError}
                        </p>
                    )}

                    <h2 className="
                        mt-10
                        text-[12px]
                        font-semibold
                        uppercase
                        tracking-[0.14em]
                        text-[var(--text-muted)]
                    ">
                        Change password
                    </h2>

                    <p className="
                        mt-3
                        max-w-[440px]
                        text-[13px]
                        leading-6
                        text-[var(--text-muted)]
                    ">
                        Your new password must be at least 8 characters. Changing it signs out every other device — this device stays signed in.
                    </p>

                    <form
                        onSubmit={handleChangePassword}
                        className="
                            mt-7
                            space-y-5
                        "
                    >
                        <div>
                            <label
                                htmlFor="change-current-password"
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
                                Current password
                            </label>
                            <input
                                id="change-current-password"
                                type="password"
                                value={currentPassword}
                                onChange={(event) => { setCurrentPassword(event.target.value); }}
                                autoComplete="current-password"
                                required
                                placeholder="Enter your current password"
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
                                htmlFor="change-new-password"
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
                                id="change-new-password"
                                type="password"
                                value={newPassword}
                                onChange={(event) => { setNewPassword(event.target.value); }}
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
                                htmlFor="change-new-password-confirm"
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
                                id="change-new-password-confirm"
                                type="password"
                                value={confirmPassword}
                                onChange={(event) => { setConfirmPassword(event.target.value); }}
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

                        {passwordError && (
                            <p role="alert" className="
                                rounded-lg
                                border
                                border-[var(--color-brand)]
                                bg-[var(--bg-selected)]
                                px-3
                                py-2.5
                                text-[11px]
                                leading-5
                                text-[var(--color-brand)]
                            ">
                                {passwordError}
                            </p>
                        )}

                        {passwordSuccess && (
                            <p role="status" className="
                                rounded-lg
                                border
                                border-[var(--border)]
                                bg-[var(--bg-panel)]
                                px-3
                                py-2.5
                                text-[11px]
                                leading-5
                                text-[var(--text-primary)]
                            ">
                                {passwordSuccess}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={changing}
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
                                {changing ? "Changing..." : "Change my password"}
                            </span>
                            <span aria-hidden="true" className="text-[18px] font-normal">→</span>
                        </button>
                    </form>

                    <p className="
                        mt-7
                        text-[12px]
                        text-[var(--text-muted)]
                    ">
                        <Link
                            to="/"
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
                            Back to Gnosis
                        </Link>
                    </p>
                </div>
            </div>
        </main>
        </>
    );
}
