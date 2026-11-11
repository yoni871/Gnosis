import { useRef } from "react";
import useLandingMotion from "../hooks/useLandingMotion";
import useReadingState from "../hooks/useReadingState";
import { readingStateLabel, readingStateUrl } from "../utils/readingState";
import { Link } from "react-router-dom";

import Seo from "../components/Seo";
import LandingHeader from "../components/LandingHeader";
import LandingFooter from "../components/LandingFooter";
import LandingExplore from "../components/LandingExplore";
import LandingPurpose from "../components/LandingPurpose";
import LandingBibleCommentary from "../components/LandingBibleCommentary";
import LandingBeyondText from "../components/LandingBeyondText";
import {
    LANDING_TITLE,
    LANDING_DESCRIPTION,
    getSiteUrl,
    pageUrl,
} from "../utils/seo";
import "./LandingPage.css";
import "./LandingHero.css";

// Public landing page for "/". The study reader stays at
// /bible/:book/:chapter; this page only links to it, never replaces
// it. Copy, palette, and sections follow the approved landing design:
// warm sandstone, cream, burgundy, deep charcoal, literary serif
// headings, clean sans-serif body.
//
// The hero image is supplied by Yonatan (a Gemini-generated desert
// sunset scene with a laptop and a phone showing the study interface)
// and is used exactly as supplied: no compositing, no screen
// replacement, no retouching — only delivery resizing (see
// frontend/public/images/landing/sunset-hero-images/README.md). No
// heading, paragraph, button, navigation, or logo is baked into the
// image; all of that is real semantic HTML below.

const STUDY_DESTINATION = "/bible/Genesis/1";

const HERO_BASE = "/images/landing/sunset-hero-images/hero";
const HERO_WIDTH = 1672;
const HERO_HEIGHT = 941;
const HERO_ALT =
    "A laptop and a phone showing the Gnosis Bible study app, resting on desert sand at sunset";

function scrollToHowItWorks(event) {
    // Preserve normal anchor behavior for modified clicks and URL/history.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const target = document.getElementById("how-it-works");
    if (!target?.scrollIntoView) return;
    event.preventDefault();
    if (window.location.hash !== "#how-it-works") window.history.pushState(null, "", "#how-it-works");
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "instant" : "smooth", block: "start" });
}

export default function LandingPage() {
    const pageRef = useRef(null);
    useLandingMotion(pageRef);
    // A logged-in reader with a saved position gets a Continue button
    // in place of Start Exploring; everyone else sees the page as before.
    const { savedState } = useReadingState(null);
    const siteUrl = getSiteUrl();
    const canonical = pageUrl("/");
    const ogImage = `${siteUrl}/images/landing/sunset-hero-images/hero-1200.jpg`;
    // hero-1200.jpg is 1200x675; the dimensions travel with the
    // social image so scrapers need no extra fetch to lay it out.
    const ogImageWidth = 1200;
    const ogImageHeight = 675;

    return (
        <div className="public-page landing-page" ref={pageRef}>
            <link rel="preload" href="/fonts/hero/cormorant-garamond-latin-600.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
            <link rel="preload" href="/fonts/hero/inter-latin-variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
            <Seo
                title={LANDING_TITLE}
                description={LANDING_DESCRIPTION}
                canonical={canonical}
                ogType="website"
                ogImage={ogImage}
                ogImageWidth={ogImageWidth}
                ogImageHeight={ogImageHeight}
                ogImageAlt={HERO_ALT}
                twitterCard="summary_large_image"
                jsonLd={{
                    "@context": "https://schema.org",
                    "@type": "WebSite",
                    name: "Gnosis",
                    url: `${siteUrl}/`,
                    description: LANDING_DESCRIPTION,
                    inLanguage: "en",
                }}
            />

            <LandingHeader hero />
            <main id="landing-main" tabIndex={-1}>
                <div className="landing-hero-shell">
                    <div className="landing-hero-media">
                        <div
                            className="landing-hero-scrim"
                            aria-hidden="true"
                        />
                        <picture>
                            <source
                                type="image/webp"
                                srcSet={`${HERO_BASE}-480.webp 480w, ${HERO_BASE}-800.webp 800w, ${HERO_BASE}-1280.webp 1280w, ${HERO_BASE}-1672.webp 1672w`}
                                sizes="(max-width: 1199px) max(178svh, 100vw), 100vw"
                            />
                            <source
                                type="image/jpeg"
                                srcSet={`${HERO_BASE}-480.jpg 480w, ${HERO_BASE}-800.jpg 800w, ${HERO_BASE}-1280.jpg 1280w, ${HERO_BASE}-1672.jpg 1672w`}
                                sizes="(max-width: 1199px) max(178svh, 100vw), 100vw"
                            />
                            <img
                                className="landing-hero-img"
                                src={`${HERO_BASE}-1280.jpg`}
                                srcSet={`${HERO_BASE}-480.jpg 480w, ${HERO_BASE}-800.jpg 800w, ${HERO_BASE}-1280.jpg 1280w, ${HERO_BASE}-1672.jpg 1672w`}
                                sizes="(max-width: 1199px) max(178svh, 100vw), 100vw"
                                width={HERO_WIDTH}
                                height={HERO_HEIGHT}
                                fetchPriority="high"
                                decoding="async"
                                alt={HERO_ALT}
                            />
                        </picture>
                    </div>
                    <section className="landing-hero" aria-labelledby="landing-hero-heading">
                        <div className="landing-hero-copy">
                            <p className="public-eyebrow">SCRIPTURE • THEOLOGY • HISTORY</p>
                            <h1 id="landing-hero-heading">
                                <span>Explore Scripture.</span>{" "}
                                <span>Discover Its Depth.</span>
                            </h1>
                            <p>
                                Discover the richness of Scripture, explore the wisdom
                                of Christian thinkers, and grow in your understanding
                                of God's Word.
                            </p>
                            <div className="landing-hero-ctas">
                                {savedState ? (
                                    <Link
                                        to={readingStateUrl(savedState)}
                                        className="landing-btn landing-btn-primary landing-btn-large landing-continue"
                                        aria-labelledby="landing-continue-label"
                                        aria-describedby="landing-reading-location"
                                    >
                                        <span id="landing-continue-label" className="landing-continue-title">Continue Reading →</span>
                                        <span id="landing-reading-location" className="landing-continue-subtitle">
                                            <span className="landing-continue-location">{readingStateLabel(savedState)}</span>
                                        </span>
                                    </Link>
                                ) : (
                                    <Link
                                        to={STUDY_DESTINATION}
                                        className="landing-btn landing-btn-primary landing-btn-large"
                                    >
                                        Start Exploring →
                                    </Link>
                                )}
                                <a
                                    href="#how-it-works"
                                    onClick={scrollToHowItWorks}
                                    className="landing-btn landing-btn-secondary landing-btn-large"
                                >
                                    See How It Works
                                </a>
                            </div>
                        </div>
                    </section>
                </div>
                <LandingPurpose />
                <LandingBibleCommentary />
                <LandingBeyondText />

                <LandingExplore />
            </main>

            <LandingFooter />
        </div>
    );
}
