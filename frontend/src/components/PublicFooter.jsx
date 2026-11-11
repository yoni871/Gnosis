import { Link } from "react-router-dom";

export default function PublicFooter() {
    return (
        <footer className="landing-footer">
            <div className="public-footer-inner">
                <div className="public-footer-intro">
                    <Link to="/" className="public-footer-brand">Gnosis</Link>
                    <p>Scripture, classic commentary, and space to reflect.</p>
                </div>
                <nav aria-label="Footer">
                    <div className="landing-footer-group">
                        <h2>Explore</h2>
                        <Link to="/about">About Us</Link>
                        <Link to="/bible/Genesis/1">Start Studying</Link>
                    </div>
                    <div className="landing-footer-group">
                        <h2>Your study</h2>
                        <Link to="/login">Sign in</Link>
                        <Link to="/register">Create account</Link>
                    </div>
                    <div className="landing-footer-group">
                        <h2>Legal</h2>
                        <Link to="/privacy">Privacy Policy</Link>
                    </div>
                </nav>
            </div>
            <div className="landing-footer-note">
                <p>Gnosis pairs the Bible text with classic commentary from Matthew Henry and Jamieson, Fausset &amp; Brown.</p>
                <p>&copy; {new Date().getFullYear()} Gnosis. A Christian Scripture-study tool.</p>
            </div>
        </footer>
    );
}
