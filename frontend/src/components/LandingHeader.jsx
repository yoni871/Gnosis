import { useContext, useRef, useState, useId } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";

import AuthContext from "../context/AuthContext";
import useClickOutside from "../hooks/useClickOutside";

// Header for the public landing page only. The study reader keeps its
// own header; this one carries the landing destinations (About Us,
// Sign in, Create account) and the real Gnosis logo asset
// (public/gnosis.svg, also the site favicon).
//
// Logged-in visitors get account behavior instead of auth links: a
// "Start Studying" button plus an account chip with a small menu
// (Continue studying / Sign out). Nothing here touches the session
// except the existing AuthContext logout, so authentication behavior
// is unchanged.

function initials(user) {
    const first = user?.first_name?.[0] ?? "";
    const last = user?.last_name?.[0] ?? "";
    const value = `${first}${last}`.toUpperCase();
    return value || "G";
}

// Desktop and mobile disclosures must own separate refs and state.
function AuthLinks({ closeAll }) {
    const { user, logout } = useContext(AuthContext);
    const [accountOpen, setAccountOpen] = useState(false);
    const trigger = useRef(null);
    const menuId = useId();
    const accountRef = useClickOutside(() => setAccountOpen(false));
    const handleSignOut = () => {
        logout();
        setAccountOpen(false);
        closeAll();
    };

    return user ? (
        <>
            <Link
                to="/bible/Genesis/1"
                className="landing-btn landing-btn-primary"
                onClick={closeAll}
            >
                Start Studying
            </Link>
            <div ref={accountRef} className="landing-account"
                onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setAccountOpen(false);
                }}
                onKeyDown={(event) => {
                    if (event.key === "Escape" && accountOpen) {
                        event.stopPropagation();
                        setAccountOpen(false);
                        trigger.current?.focus();
                    }
                }}
            >
                <button
                    type="button"
                    className="landing-account-chip"
                    aria-expanded={accountOpen}
                    aria-controls={menuId}
                    ref={trigger}
                    aria-label={`Account menu for ${user.first_name} ${user.last_name}`}
                    onClick={() => setAccountOpen((open) => !open)}
                >
                    <span className="landing-account-initials" aria-hidden="true">
                        {initials(user)}
                    </span>
                    <span className="landing-account-name">
                        {user.first_name} {user.last_name}
                    </span>
                </button>
                {accountOpen && (
                    <div id={menuId} className="landing-account-menu">
                        <Link to="/bible/Genesis/1" onClick={closeAll}>
                            Continue studying
                        </Link>
                        <button type="button" onClick={handleSignOut}>
                            Sign out
                        </button>
                    </div>
                )}
            </div>
        </>
    ) : (
        <>
            <Link to="/login" className="landing-link" onClick={closeAll}>
                Sign in
            </Link>
            <Link
                to="/register"
                className="landing-btn landing-btn-primary"
                onClick={closeAll}
            >
                Create account
            </Link>
        </>
    );

}

export default function LandingHeader() {
    const { isAuthLoading } = useContext(AuthContext);
    const [mobileOpen, setMobileOpen] = useState(false);
    const trigger = useRef(null);
    // Include the toggle in the outside-click boundary; otherwise a mouse
    // press closes the menu before the toggle's click opens it again.
    const headerRef = useClickOutside(() => setMobileOpen(false));
    const closeAll = () => setMobileOpen(false);

    return (
        <header ref={headerRef} className="landing-header"
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) closeAll();
            }}
            onKeyDown={(event) => {
                if (event.key === "Escape" && mobileOpen) {
                    closeAll();
                    trigger.current?.focus();
                }
            }}
        >
            <a className="landing-skip" href="#landing-main">
                Skip to main content
            </a>
            <div className="landing-header-inner">
                <Link to="/" className="landing-logo" aria-label="Gnosis home">
                    <img
                        src="/gnosis.svg"
                        alt=""
                        width="40"
                        height="40"
                        className="landing-logo-img"
                    />
                    <span className="landing-logo-word">Gnosis</span>
                </Link>

                <nav
                    className="landing-nav-desktop"
                    aria-label="Primary"
                >
                    <a href="#about" className="landing-link">
                        About Us
                    </a>
                    {!isAuthLoading && <AuthLinks closeAll={closeAll} />}
                </nav>

                <button
                    type="button"
                    className="landing-menu-button"
                    ref={trigger}
                    aria-expanded={mobileOpen}
                    aria-controls="landing-mobile-menu"
                    aria-label={mobileOpen ? "Close menu" : "Open menu"}
                    onClick={() => setMobileOpen((open) => !open)}
                >
                    {mobileOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </div>

            {mobileOpen && (
                <nav
                    id="landing-mobile-menu"
                    className="landing-nav-mobile"
                    aria-label="Mobile"
                >
                    <a href="#about" onClick={closeAll}>
                        About Us
                    </a>
                    {!isAuthLoading && <AuthLinks closeAll={closeAll} />}
                </nav>
            )}
        </header>
    );
}
