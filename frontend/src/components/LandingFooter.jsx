import { Link } from "react-router-dom";
import "./LandingFooter.css";

const GROUPS = [
    { title: "Explore", links: [{ label: "Bible & Commentary", to: "/bible/Genesis/1" }] },
    { title: "Gnosis", links: [{ label: "About", to: "/about" }, { label: "Sign In", to: "/login" }, { label: "Create Account", to: "/register" }] },
];

export default function LandingFooter() {
    return (
        <footer className="landing-closing-footer">
            <div className="landing-closing-footer-inner">
                <div className="landing-closing-footer-main">
                    <div className="landing-closing-footer-brand">
                        <Link to="/" className="landing-closing-logo" aria-label="Gnosis home">
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
                <p className="landing-closing-copyright">© 2026 Gnosis. All rights reserved.</p>
            </div>
        </footer>
    );
}
