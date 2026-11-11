import { useContext } from "react";
import { Link } from "react-router-dom";
import { Moon, Sun } from "lucide-react";

import ThemeContext from "../context/ThemeContext";
import "./LandingFooter.css";

const GROUPS = [
    { title: "Explore", links: [{ label: "Bible & Commentary", to: "/bible/Genesis/1" }] },
    { title: "Gnosis", links: [{ label: "About", to: "/about" }, { label: "Privacy", to: "/privacy" }, { label: "Sign In", to: "/login" }, { label: "Create Account", to: "/register" }] },
];

export default function LandingFooter() {
    const { theme, setTheme } = useContext(ThemeContext);
    return (
        <footer className="landing-closing-footer">
            <div className="landing-closing-footer-inner">
                <div className="landing-closing-footer-main">
                    <div className="landing-closing-footer-brand">
                        <Link to="/" className="landing-closing-logo" aria-label="Gnosis home" onClick={(event) => {
                            event.preventDefault();
                            window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
                        }}>
                            <img src="/gnosis.svg" alt="" width="40" height="40" />
                            <span>Gnosis</span>
                        </Link>
                        <p><em>Explore Scripture. Discover Its Depth.</em></p>
                    </div>
                    <nav aria-label="Footer">
                        {GROUPS.map(({ title, links }) => (
                            <div className="landing-closing-footer-group" key={title}>
                                <h2>{title}</h2>
                                {links.map(({ label, to }) => <Link key={to} to={to}>{label}</Link>)}
                            </div>
                        ))}
                    </nav>
                </div>
                <div className="landing-closing-copyright-row">
                    <p className="landing-closing-copyright">© 2026 Gnosis. All rights reserved.</p>
                    {/* The footer is the theme control for logged-out
                        visitors on desktop: they have no account menu, and
                        the header toggle was removed for crowding the nav. */}
                    <button
                        type="button"
                        className="landing-footer-theme"
                        aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
                        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                    >
                        {theme === "light" ? <Moon size={15} aria-hidden="true" /> : <Sun size={15} aria-hidden="true" />}
                        {theme === "light" ? "Dark mode" : "Light mode"}
                    </button>
                </div>
            </div>
        </footer>
    );
}
