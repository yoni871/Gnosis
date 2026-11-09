import { useContext, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import PasswordInput from "../components/PasswordInput";
import Seo from "../components/Seo";
import { pageUrl } from "../utils/seo";
import {
    listPasskeys,
    registerPasskey,
    renamePasskey,
    removePasskey,
} from "../services/passkeyService";

// Passkeys live alongside passwords: a passkey signs the user in
// without typing a password, and the password always still works —
// losing a passkey can never lock an account out. This page is a
// standalone account page for now; it moves into Settings when the
// Settings page lands (PR #89).
export default function PasskeysPage() {
    const { user, getAccessToken, isAuthLoading } = useContext(AuthContext);
    const [passkeys, setPasskeys] = useState(null);
    const [loadError, setLoadError] = useState("");
    const [password, setPassword] = useState("");
    const [label, setLabel] = useState("");
    const [formError, setFormError] = useState("");
    const [formStatus, setFormStatus] = useState("idle");
    const [editingId, setEditingId] = useState(null);
    const [editingLabel, setEditingLabel] = useState("");
    const [removingId, setRemovingId] = useState(null);
    const [removePassword, setRemovePassword] = useState("");
    const [removeError, setRemoveError] = useState("");

    useEffect(() => {
        if (!user) return;
        let active = true;
        listPasskeys(getAccessToken())
            .then((items) => { if (active) setPasskeys(items); })
            .catch(() => { if (active) setLoadError("Could not load your passkeys. Try again."); });
        return () => { active = false; };
    }, [user, getAccessToken]);

    if (isAuthLoading) {
        return <main role="status" aria-live="polite" className="flex min-h-screen items-center justify-center text-[14px] text-[var(--text-muted)]">Loading…</main>;
    }
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    async function refresh() {
        setPasskeys(await listPasskeys(getAccessToken()));
    }

    async function handleRegister(event) {
        event.preventDefault();
        setFormError("");
        setFormStatus("registering");
        try {
            await registerPasskey(getAccessToken(), password, label.trim() || undefined);
            setPassword("");
            setLabel("");
            await refresh();
            setFormStatus("idle");
        } catch (error) {
            setFormStatus("idle");
            // A cancelled browser ceremony surfaces as a NotAllowedError
            // from the authenticator, not a server error: say so plainly.
            setFormError(error.name === "NotAllowedError"
                ? "The passkey setup was cancelled. Try again when you are ready."
                : (error.message || "Could not add this passkey. Try again."));
        }
    }

    async function handleRename(passkey) {
        setFormError("");
        try {
            await renamePasskey(getAccessToken(), passkey.id, editingLabel.trim());
            setEditingId(null);
            await refresh();
        } catch (error) {
            setFormError(error.message || "Could not rename this passkey. Try again.");
        }
    }

    async function handleRemove(passkey) {
        setRemoveError("");
        try {
            await removePasskey(getAccessToken(), passkey.id, removePassword);
            setRemovingId(null);
            setRemovePassword("");
            await refresh();
        } catch (error) {
            setRemoveError(error.message || "Could not remove this passkey. Try again.");
        }
    }

    return (
        <>
        <Seo
            title="Passkeys | Gnosis"
            description="Add or remove passkeys to sign in to Gnosis without typing your password."
            canonical={pageUrl("/passkeys")}
            robots="noindex, nofollow"
        />
        <main className="flex min-h-screen items-center justify-center bg-[var(--bg-selected)] px-6 py-12">
            <div className="w-full max-w-[520px]">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2rem] text-[var(--color-brand)]">
                    Sign-in security
                </p>
                <h1 className="font-serif text-[36px] font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
                    Passkeys
                </h1>
                <p className="mt-3 max-w-[440px] text-[13px] leading-6 text-[var(--text-muted)]">
                    A passkey lets you sign in with your device — face, fingerprint, or PIN — instead of typing
                    your password. It cannot be phished, and your password always still works, so losing a
                    passkey can never lock you out of your account.
                </p>

                {loadError && (
                    <p role="alert" className="mt-6 text-[13px] text-[var(--color-brand)]">{loadError}</p>
                )}

                {passkeys !== null && (
                    <section aria-label="Your passkeys" className="mt-8">
                        {passkeys.length === 0 ? (
                            <p className="text-[13px] text-[var(--text-muted)]">
                                You have no passkeys yet. Add one below.
                            </p>
                        ) : (
                            <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--bg-panel)]">
                                {passkeys.map((passkey) => (
                                    <li key={passkey.id} className="px-4 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                            {editingId === passkey.id ? (
                                                <span className="flex flex-1 items-center gap-2">
                                                    <input
                                                        aria-label="Passkey name"
                                                        value={editingLabel}
                                                        onChange={(event) => setEditingLabel(event.target.value)}
                                                        maxLength={100}
                                                        className="min-w-0 flex-1 rounded-md border border-[var(--border-control)] bg-[var(--bg-input)] px-2 py-1.5 text-[13px] text-[var(--text-primary)]"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRename(passkey)}
                                                        className="text-[12px] font-semibold text-[var(--color-brand)]"
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingId(null)}
                                                        className="text-[12px] text-[var(--text-muted)]"
                                                    >
                                                        Cancel
                                                    </button>
                                                </span>
                                            ) : (
                                                <>
                                                    <span className="min-w-0">
                                                        <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">
                                                            {passkey.label || "Passkey"}
                                                        </span>
                                                        <span className="block text-[12px] text-[var(--text-muted)]">
                                                            Added {new Date(passkey.createdAt).toLocaleDateString()}
                                                            {passkey.lastUsedAt
                                                                ? ` · Last used ${new Date(passkey.lastUsedAt).toLocaleDateString()}`
                                                                : " · Never used"}
                                                            {passkey.flaggedAt && " · Flagged — remove it and add a new one"}
                                                        </span>
                                                    </span>
                                                    <span className="flex shrink-0 gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => { setEditingId(passkey.id); setEditingLabel(passkey.label || ""); }}
                                                            className="text-[12px] font-semibold text-[var(--color-brand)]"
                                                        >
                                                            Rename
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { setRemovingId(passkey.id); setRemovePassword(""); setRemoveError(""); }}
                                                            className="text-[12px] font-semibold text-[var(--color-brand)]"
                                                        >
                                                            Remove
                                                        </button>
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                        {removingId === passkey.id && (
                                            <div className="mt-3 rounded-lg border border-[var(--border)] p-3">
                                                <p className="text-[12px] text-[var(--text-muted)]">
                                                    Confirm with your password to remove “{passkey.label || "Passkey"}”.
                                                    Your password sign-in keeps working.
                                                </p>
                                                <div className="mt-2 flex items-end gap-2">
                                                    <label className="flex min-w-0 flex-1 flex-col gap-1 text-[12px] font-semibold text-[var(--text-primary)]">
                                                        Current password
                                                        <PasswordInput
                                                            id="remove-password"
                                                            value={removePassword}
                                                            onChange={(event) => setRemovePassword(event.target.value)}
                                                            autoComplete="current-password"
                                                            className="w-full rounded-md border border-[var(--border-control)] bg-[var(--bg-input)] px-3 py-2 text-[13px] font-normal text-[var(--text-primary)]"
                                                        />
                                                    </label>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemove(passkey)}
                                                        className="shrink-0 rounded-md bg-[var(--color-brand)] px-3 py-2 text-[12px] font-semibold text-white"
                                                    >
                                                        Remove passkey
                                                    </button>
                                                </div>
                                                {removeError && (
                                                    <p role="alert" className="mt-2 text-[12px] text-[var(--color-brand)]">{removeError}</p>
                                                )}
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                )}

                <section aria-label="Add a passkey" className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] p-4">
                    <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Add a passkey</h2>
                    <p className="mt-1 text-[12px] leading-5 text-[var(--text-muted)]">
                        Confirm with your current password, then follow your device&apos;s prompt. Give the passkey
                        a name so you can tell your devices apart.
                    </p>
                    <form onSubmit={handleRegister} className="mt-4 flex flex-col gap-3">
                        <label className="flex flex-col gap-1 text-[12px] font-semibold text-[var(--text-primary)]">
                            Name for this passkey
                            <input
                                value={label}
                                onChange={(event) => setLabel(event.target.value)}
                                maxLength={100}
                                placeholder="MacBook"
                                className="rounded-md border border-[var(--border-control)] bg-[var(--bg-input)] px-3 py-2 text-[13px] font-normal text-[var(--text-primary)]"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-[12px] font-semibold text-[var(--text-primary)]">
                            Current password
                            <PasswordInput
                                id="register-password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                autoComplete="current-password"
                                className="w-full rounded-md border border-[var(--border-control)] bg-[var(--bg-input)] px-3 py-2 text-[13px] font-normal text-[var(--text-primary)]"
                            />
                        </label>
                        {formError && (
                            <p role="alert" className="text-[12px] text-[var(--color-brand)]">{formError}</p>
                        )}
                        <button
                            type="submit"
                            disabled={formStatus === "registering" || !password}
                            className="rounded-md bg-[var(--color-brand)] px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
                        >
                            {formStatus === "registering" ? "Waiting for your device…" : "Add passkey"}
                        </button>
                    </form>
                </section>

                <p className="mt-7 text-[12px] text-[var(--text-muted)]">
                    <Link to="/bible/Genesis/1" className="font-semibold text-[var(--color-brand)] underline decoration-[var(--border-control)] underline-offset-4 transition hover:decoration-[var(--color-brand)]">
                        Back to reading
                    </Link>
                </p>
            </div>
        </main>
        </>
    );
}
