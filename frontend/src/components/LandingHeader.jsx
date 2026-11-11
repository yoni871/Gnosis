import { useContext, useRef, useState, useId } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Menu, Moon, Sun, X } from "lucide-react";

import AuthContext from "../context/AuthContext";
import ThemeContext from "../context/ThemeContext";
import useClickOutside from "../hooks/useClickOutside";
import { shouldCloseDisclosureOnBlur } from "../utils/disclosureFocus";
import ExploreDropdown from "./ExploreDropdown";
import "./LandingNavbar.css";

// Shared public navigation. The hero layout also supports a solid background
// in normal flow for About. Both reuse the same logo, disclosures and actions;
// no session/authentication contract changes.

function initials(user) {
    const first = user?.first_name?.[0] ?? "";
    const last = user?.last_name?.[0] ?? "";
    const value = `${first}${last}`.toUpperCase();
    return value || "G";
}

// Desktop and mobile disclosures must own separate refs and state.
function AuthLinks({ closeAll, hero = false }) {
    const { user, logout } = useContext(AuthContext);
    const { theme, setTheme } = useContext(ThemeContext);
    const [accountOpen, setAccountOpen] = useState(false);
    const trigger = useRef(null);
    const menuId = useId();
    const accountRef = useClickOutside(() => setAccountOpen(false), "click");
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
                {hero ? "Start Exploring →" : "Start Studying"}
            </Link>
            <div ref={accountRef} className="landing-account"
                onBlur={(event) => {
                    if (shouldCloseDisclosureOnBlur(event)) setAccountOpen(false);
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
                    <span className="landing-account-name" title={`${user.first_name} ${user.last_name}`}>
                        {user.first_name} {user.last_name}
                    </span>
                    <ChevronDown size={13} className="landing-account-chevron" aria-hidden="true" />
                </button>
                {accountOpen && (
                    <ul id={menuId} className="landing-nav-popover landing-account-menu">
                        {/* No Profile item: there is no profile page, and the
                            button that used to sit here had no handler — it
                            did nothing when clicked. The item returns when a
                            profile page lands. */}
                        <li>
                            <Link to="/settings" onClick={() => { setAccountOpen(false); closeAll(); }}>Settings</Link>
                        </li>
                        {/* Theme lives here now, not as a button in the
                            header: the standalone header toggle crowded the
                            navigation. The menu stays open on toggle so the
                            change is visible immediately. */}
                        <li>
                            <button
                                type="button"
                                className="landing-theme-row"
                                aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
                                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                            >
                                {theme === "light" ? <Moon size={15} aria-hidden="true" /> : <Sun size={15} aria-hidden="true" />}
                                {theme === "light" ? "Dark mode" : "Light mode"}
                            </button>
                        </li>
                        <li className="landing-account-signout">
                            <button type="button" onClick={handleSignOut}>Sign out</button>
                        </li>
                    </ul>
                )}
            </div>
        </>
    ) : (
        <>
            <Link to="/login" className="landing-link" onClick={closeAll}>
                {hero ? "Sign In" : "Sign in"}
            </Link>
            <Link
                to={hero ? "/bible/Genesis/1" : "/register"}
                className="landing-btn landing-btn-primary"
                onClick={closeAll}
            >
                {hero ? "Start Exploring →" : "Create account"}
            </Link>
        </>
    );

}

export default function LandingHeader({ hero = false, solid = false }) {
    const { user, isAuthLoading } = useContext(AuthContext);
    const { theme, setTheme } = useContext(ThemeContext);
    const [mobileOpen, setMobileOpen] = useState(false);
    const trigger = useRef(null);
    const headerRef = useClickOutside(() => setMobileOpen(false), "click");
    const closeAll = () => setMobileOpen(false);

    return (
        <header ref={headerRef} className={`landing-header${hero ? " landing-header-hero" : ""}${solid ? " landing-header-solid" : ""}`}
            onBlur={(event) => {
                if (shouldCloseDisclosureOnBlur(event)) closeAll();
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
                    className={`landing-nav-desktop${hero ? " landing-nav-center" : ""}`}
                    aria-label="Primary"
                >
                    {hero && <ExploreDropdown onNavigate={closeAll} />}
                    <Link to="/about" className="landing-link">
                        {hero ? "About" : "About Us"}
                    </Link>
                    {!hero && !isAuthLoading && <AuthLinks closeAll={closeAll} />}
                </nav>
                {hero && (
                    <nav className="landing-nav-desktop landing-nav-actions" aria-label="Account">
                        {!isAuthLoading && <AuthLinks closeAll={closeAll} hero />}
                    </nav>
                )}

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
                    {hero && <ExploreDropdown onNavigate={closeAll} />}
                    <Link to="/about" onClick={closeAll}>
                        {hero ? "About" : "About Us"}
                    </Link>
                    {!isAuthLoading && <AuthLinks closeAll={closeAll} hero={hero} />}
                    {/* Logged-out visitors have no account menu, so the
                        theme control lives here on mobile; logged-in
                        visitors get it inside the account dropdown
                        instead, so it is never shown twice. Desktop
                        logged-out visitors get it in the footer. */}
                    {!isAuthLoading && !user && (
                        <button
                            type="button"
                            className="landing-mobile-theme"
                            aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
                            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                        >
                            {theme === "light" ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
                            {theme === "light" ? "Dark mode" : "Light mode"}
                        </button>
                    )}
                </nav>
            )}
        </header>
    );
}
