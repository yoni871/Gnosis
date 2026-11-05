import { Link } from "react-router-dom";

import Seo from "../components/Seo";
import LandingHeader from "../components/LandingHeader";
import PublicFooter from "../components/PublicFooter";
import {
    LANDING_TITLE,
    LANDING_DESCRIPTION,
    chapterPath,
    getSiteUrl,
    pageUrl,
} from "../utils/seo";
import "./LandingPage.css";

// Public landing page for "/". The study reader stays at
// /bible/:book/:chapter; this page only links to it, never replaces
// it. Copy, palette, and sections follow the approved landing design:
// warm sandstone, cream, deep charcoal, muted olive, literary serif
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

const EXPLORE_PASSAGES = [
    { book: "Genesis", chapter: 1, label: "Genesis 1", note: "In the beginning" },
    { book: "Psalms", chapter: 1, label: "Psalm 1", note: "Blessed is the one" },
    { book: "Psalms", chapter: 23, label: "Psalm 23", note: "The Lord is my shepherd" },
    { book: "Isaiah", chapter: 53, label: "Isaiah 53", note: "The suffering servant" },
    { book: "Matthew", chapter: 5, label: "Matthew 5", note: "The Sermon on the Mount" },
    { book: "John", chapter: 1, label: "John 1", note: "In the beginning was the Word" },
    { book: "Romans", chapter: 8, label: "Romans 8", note: "Life in the Spirit" },
    { book: "Philippians", chapter: 4, label: "Philippians 4", note: "Rejoice in the Lord" },
];

const FEATURES = [
    {
        title: "Verse-by-verse insight",
        text: "Read Scripture alongside classic commentary for a richer understanding.",
    },
    {
        title: "Notes and highlights",
        text: "Mark what matters, add your own notes, and revisit them anytime.",
    },
    {
        title: "Focused study",
        text: "A clean, distraction-free space designed for thoughtful, consistent Bible study.",
    },
];

export default function LandingPage() {
    const siteUrl = getSiteUrl();
    const canonical = pageUrl("/");
    const ogImage = `${siteUrl}/images/landing/sunset-hero-images/hero-1200.jpg`;

    return (
        <div className="public-page landing-page">
            <Seo
                title={LANDING_TITLE}
                description={LANDING_DESCRIPTION}
                canonical={canonical}
                ogType="website"
                ogImage={ogImage}
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

            <div className="landing-hero-shell">
                <LandingHeader hero />
                <div className="landing-hero-media">
                    <div
                        className="landing-hero-scrim"
                        aria-hidden="true"
                    />
                    <picture>
                        <source
                            type="image/webp"
                            srcSet={`${HERO_BASE}-480.webp 480w, ${HERO_BASE}-800.webp 800w, ${HERO_BASE}-1280.webp 1280w, ${HERO_BASE}-1672.webp 1672w`}
                            sizes="100vw"
                        />
                        <source
                            type="image/jpeg"
                            srcSet={`${HERO_BASE}-480.jpg 480w, ${HERO_BASE}-800.jpg 800w, ${HERO_BASE}-1280.jpg 1280w, ${HERO_BASE}-1672.jpg 1672w`}
                            sizes="100vw"
                        />
                        <img
                            className="landing-hero-img"
                            src={`${HERO_BASE}-1280.jpg`}
                            srcSet={`${HERO_BASE}-480.jpg 480w, ${HERO_BASE}-800.jpg 800w, ${HERO_BASE}-1280.jpg 1280w, ${HERO_BASE}-1672.jpg 1672w`}
                            sizes="100vw"
                            width={HERO_WIDTH}
                            height={HERO_HEIGHT}
                            fetchPriority="high"
                            decoding="async"
                            alt="A laptop and a phone showing the Gnosis Bible study app, resting on desert sand at sunset"
                        />
                    </picture>
                </div>
            </div>
            <main id="landing-main" tabIndex={-1}>
                <section className="landing-hero" aria-labelledby="landing-hero-heading">
                    <div className="landing-hero-copy">
                        <p className="public-eyebrow">A quieter space for deeper study</p>
                        <h1 id="landing-hero-heading">
                            Study Scripture with clarity and depth
                        </h1>
                        <p>
                            Read the Bible alongside trusted classic
                            commentary. Explore each verse, take notes,
                            and keep your study organized.
                        </p>
                        <div className="landing-hero-ctas">
                            <Link
                                to={STUDY_DESTINATION}
                                className="landing-btn landing-btn-primary landing-btn-large"
                            >
                                Start Studying
                            </Link>
                            <a
                                href="#how-it-works"
                                className="landing-btn landing-btn-secondary landing-btn-large"
                            >
                                See how it works
                            </a>
                        </div>
                    </div>
                </section>

                <section
                    className="landing-section landing-features"
                    aria-labelledby="landing-features-heading"
                >
                    <h2 id="landing-features-heading">
                        Scripture and commentary, side by side
                    </h2>
                    <p className="landing-section-lede">
                        A focused, reliable way to read the Bible with
                        the wisdom of trusted Bible teachers.
                    </p>
                    <div className="landing-cards">
                        {FEATURES.map((feature) => (
                            <article
                                key={feature.title}
                                className="landing-card"
                            >
                                <h3>{feature.title}</h3>
                                <p>{feature.text}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section
                    id="how-it-works"
                    className="landing-section landing-how"
                    aria-labelledby="landing-how-heading"
                >
                    <h2 id="landing-how-heading">How it works</h2>
                    <p>
                        Open any passage and the chapter appears with
                        classic commentary beside it, verse by verse.
                        Read a verse, then read what trusted teachers
                        have said about that same verse, without losing
                        your place. When something stands out, highlight
                        it or add a note, and your study stays organized
                        around the passages you are reading.
                    </p>
                    <ol className="landing-steps">
                        <li>
                            <strong>Choose a passage.</strong> Start
                            with Genesis 1 or pick any book and chapter
                            to explore.
                        </li>
                        <li>
                            <strong>Read verse by verse.</strong>{" "}
                            Scripture and commentary sit side by side,
                            so each verse is explained in context.
                        </li>
                        <li>
                            <strong>Keep what matters.</strong>{" "}
                            Highlight verses and write notes you can
                            return to anytime.
                        </li>
                    </ol>
                </section>

                <section
                    className="landing-section landing-commentaries"
                    aria-labelledby="landing-commentaries-heading"
                >
                    <h2 id="landing-commentaries-heading">
                        Trusted classic commentary
                    </h2>
                    <p className="landing-section-lede">
                        Gnosis pairs the Bible text with commentary
                        from teachers whose work has guided readers for
                        generations. Choose the source that serves the
                        passage you are studying.
                    </p>
                    <div className="landing-cards">
                        <article className="landing-card">
                            <h3>Matthew Henry</h3>
                            <p>
                                Matthew Henry&apos;s Complete
                                Commentary on the Whole Bible, by the
                                English biblical commentator and
                                minister Matthew Henry.
                            </p>
                        </article>
                        <article className="landing-card">
                            <h3>Jamieson, Fausset &amp; Brown</h3>
                            <p>
                                Commentary Critical and Explanatory on
                                the Whole Bible, by Robert Jamieson,
                                A. R. Fausset, and David Brown.
                            </p>
                        </article>
                    </div>
                </section>

                <section className="landing-section landing-about" aria-labelledby="landing-about-heading">
                    <p className="public-eyebrow">The purpose behind Gnosis</p>
                    <h2 id="landing-about-heading">Rooted in Scripture. Made for thoughtful study.</h2>
                    <p>Gnosis is a Christian Scripture-study application, bringing the Bible, classic commentary, and your reflections together in one focused space.</p>
                    <Link className="public-text-link" to="/about">About Us <span aria-hidden="true">→</span></Link>
                </section>

                <section
                    id="explore"
                    className="landing-section landing-explore"
                    aria-labelledby="landing-explore-heading"
                >
                    <h2 id="landing-explore-heading">
                        Explore Scripture
                    </h2>
                    <p className="landing-section-lede">
                        Start with a familiar passage, or open one you
                        have never studied closely.
                    </p>
                    <ul className="landing-passages">
                        {EXPLORE_PASSAGES.map((passage) => (
                            <li key={passage.label}>
                                <Link
                                    to={chapterPath(
                                        passage.book,
                                        passage.chapter,
                                    )}
                                >
                                    <strong>{passage.label}</strong>
                                    <span>{passage.note}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>

                <section
                    className="landing-section landing-final-cta"
                    aria-labelledby="landing-final-heading"
                >
                    <h2 id="landing-final-heading">
                        Start studying today
                    </h2>
                    <p>
                        Open the reader and begin with Genesis 1, or
                        pick any passage to explore.
                    </p>
                    <Link
                        to={STUDY_DESTINATION}
                        className="landing-btn landing-btn-primary landing-btn-large"
                    >
                        Start Studying
                    </Link>
                </section>
            </main>

            <PublicFooter />
        </div>
    );
}
