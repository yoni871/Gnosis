import { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthContext from "../context/AuthContext";
import Seo from "../components/Seo";
import LandingHeader from "../components/LandingHeader";
import LandingFooter from "../components/LandingFooter";
import PasswordInput from "../components/PasswordInput";
import { deleteAccount } from "../services/authService";
import { pageUrl } from "../utils/seo";
import "./LandingPage.css";
import "./SettingsPage.css";

// Account settings. The only setting today is account deletion; the
// page exists so the Profile menu's Settings item has somewhere real
// to go, and so deletion has a home that is reachable without knowing
// the API. Deletion is deliberately a plain password confirmation,
// not a second factor or an emailed link: the password is the
// re-authentication, and the endpoint deletes everything in one
// transaction. On success the local session is cleared and the user
// lands on the logged-out homepage.
export default function SettingsPage() {
    const { user, token, isAuthLoading, logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const [password, setPassword] = useState("");
    const [deleteError, setDeleteError] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);

    async function handleDelete(event) {
        event.preventDefault();
        setDeleteError("");
        setIsDeleting(true);
        try {
            await deleteAccount(token, password);
            logout();
            navigate("/");
        } catch (error) {
            setDeleteError(error.message || "Unable to delete your account.");
        } finally {
            setIsDeleting(false);
        }
    }

    return (
        <div className="public-page settings-page">
            <Seo title="Settings | Gnosis"
                description="Manage your Gnosis account, including deleting it."
                canonical={pageUrl("/settings")}
                robots="noindex, nofollow" />
            <LandingHeader hero solid />
            <main id="landing-main" tabIndex={-1} className="settings-layout">
                <h1>Settings</h1>
                {isAuthLoading ? (
                    <p role="status">Loading…</p>
                ) : !user ? (
                    <p>
                        Sign in to manage your account.{" "}
                        <Link to="/login">Sign in</Link>
                    </p>
                ) : (
                    <>
                        <section aria-labelledby="settings-account-heading">
                            <h2 id="settings-account-heading">Your account</h2>
                            <p>
                                {user.first_name} {user.last_name} · {user.email}
                            </p>
                        </section>

                        <section aria-labelledby="settings-delete-heading" className="settings-danger">
                            <h2 id="settings-delete-heading">Delete account</h2>
                            <p>
                                Deleting your account permanently removes your account, your
                                notes, bookmarks, highlights, reading position, and sessions.
                                This cannot be undone. Read the{" "}
                                <Link to="/privacy">Privacy Policy</Link> for what is kept
                                and for how long.
                            </p>
                            <form onSubmit={handleDelete}>
                                <label htmlFor="delete-account-password">
                                    Confirm with your current password
                                </label>
                                <PasswordInput
                                    id="delete-account-password"
                                    className="settings-password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    autoComplete="current-password"
                                />
                                {deleteError && (
                                    <p role="alert" className="settings-error">{deleteError}</p>
                                )}
                                <button
                                    type="submit"
                                    className="settings-delete-button"
                                    disabled={password.length === 0 || isDeleting}
                                >
                                    {isDeleting ? "Deleting…" : "Delete my account"}
                                </button>
                            </form>
                        </section>
                    </>
                )}
            </main>
            <LandingFooter />
        </div>
    );
}
