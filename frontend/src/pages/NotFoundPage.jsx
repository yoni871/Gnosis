import { Link } from "react-router-dom";
import LandingHeader from "../components/LandingHeader";
import LandingFooter from "../components/LandingFooter";
import Seo from "../components/Seo";
import "./LandingPage.css";
import "./NotFoundPage.css";

// Unknown URLs used to render a completely blank page: App had no
// catch-all route, so React Router rendered nothing. This page gives
// mistyped links and stale bookmarks somewhere to land instead.
export default function NotFoundPage() {
    return (
        <div className="public-page not-found-page">
            <Seo
                title="Page not found | Gnosis"
                description="This page does not exist on Gnosis. Return to the homepage or explore Scripture."
                robots="noindex, nofollow"
            />
            <LandingHeader hero solid />
            <main id="landing-main" tabIndex={-1} className="not-found-layout">
                <p className="not-found-eyebrow">404</p>
                <h1>Page not found</h1>
                <p>
                    This page does not exist — the link may be mistyped, or the
                    page may have moved.
                </p>
                <div className="not-found-actions">
                    <Link to="/" className="landing-btn landing-btn-primary">
                        Go to the homepage
                    </Link>
                    <Link to="/bible/Genesis/1" className="landing-btn landing-btn-secondary">
                        Start exploring Scripture
                    </Link>
                </div>
            </main>
            <LandingFooter />
        </div>
    );
}
