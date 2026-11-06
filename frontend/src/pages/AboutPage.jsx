import { useRef } from "react";
import { Link } from "react-router-dom";
import LandingHeader from "../components/LandingHeader";
import LandingFooter from "../components/LandingFooter";
import AboutSectionNavigation from "../components/AboutSectionNavigation";
import Seo from "../components/Seo";
import useAboutMotion from "../hooks/useAboutMotion";
import { ABOUT_SECTIONS, GNOSIS_PASSAGES } from "./aboutContent";
import { chapterPath, pageUrl } from "../utils/seo";
import "./LandingPage.css";
import "./LandingHero.css";
import "./AboutPage.css";

function ScriptureCard({ passage }) {
    const [before, after] = passage.quotation.split("knowledge");
    const destination = `${chapterPath(passage.book, passage.chapter)}?verse=${passage.verse}&translation=KJV`;
    return (
        <article className="about-scripture-card" data-about-reveal>
            <Link to={destination} className="about-scripture-link" aria-label={`Read ${passage.reference} in Bible`}>
                <div className="about-passage-top"><span>{passage.reference}</span><span>KJV</span></div>
                <h3>{passage.title}</h3>
                <blockquote>{before}<span className="about-knowledge">knowledge</span>{after}</blockquote>
                <div className="about-passage-context">
                    <p className="about-greek-form"><span lang="grc">{passage.greek}</span><em>{passage.transliteration}</em></p>
                    <p>{passage.explanation}</p>
                </div>
                <span className="about-read-link">Read in Bible <span aria-hidden="true">→</span></span>
            </Link>
        </article>
    );
}
export default function AboutPage() {
    const page = useRef(null);
    useAboutMotion(page);
    return (
        <div className="public-page about-page" ref={page}>
            <link rel="preload" href="/fonts/hero/cormorant-garamond-latin-600.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
            <link rel="preload" href="/fonts/hero/inter-latin-variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
            <Seo title="About Gnosis | Scripture, Commentary & Thoughtful Study"
                description="Learn about Gnosis, a Christian Bible study application bringing Scripture, classic commentary, notes, bookmarks, and highlights into one focused space."
                canonical={pageUrl("/about")} />
            <LandingHeader />
            <main id="landing-main" tabIndex={-1} className="about-editorial-layout">
                <AboutSectionNavigation sections={ABOUT_SECTIONS} />
                <div className="about-editorial-reading">
                    <section id="about-gnosis" className="about-opening" tabIndex={-1} aria-labelledby="about-title">
                        <h1 id="about-title">About Gnosis</h1>
                        <p>Gnosis was created with a simple conviction: the study of Scripture becomes richer when we explore its context, engage with Christian thinkers, and understand the history surrounding God's Word.</p>
                    </section>
                    <section id="meaning" tabIndex={-1} aria-labelledby="meaning-heading">
                        <p className="about-editorial-eyebrow">THE MEANING OF GNOSIS</p>
                        <h2 id="meaning-heading" data-about-reveal>Why the Name Gnosis?</h2>
                        <div className="about-meaning-grid">
                            <div className="about-greek-word" data-about-reveal><p lang="grc">γνῶσις</p><p><em>Gnōsis — Knowledge</em></p></div>
                            <p>The name Gnosis comes from the Greek word <span lang="grc">γνῶσις</span> (gnōsis), meaning knowledge. Throughout the New Testament, this word is used in different contexts to describe knowledge of salvation, the depths of God's wisdom, the surpassing worth of knowing Christ, and the believer's continual growth in understanding.</p>
                        </div>
                        <aside className="about-gnosticism" aria-labelledby="gnosticism-heading">
                            <h3 id="gnosticism-heading">A Note on Gnosticism</h3>
                            <p>Although the word <em>gnosis</em> is associated with Gnosticism, Gnosis is not connected to Gnosticism or its teachings. The application is a Christian Bible-study companion, centered on Scripture and thoughtful reflection.</p>
                        </aside>
                    </section>
                    <section id="scripture" tabIndex={-1} aria-labelledby="scripture-heading">
                        <p className="about-editorial-eyebrow">KNOWLEDGE ROOTED IN SCRIPTURE</p>
                        <h2 id="scripture-heading" data-about-reveal>Gnosis in Scripture</h2>
                        <p className="about-section-introduction">Four passages that reflect the meaning behind the name.</p>
                        <div className="about-scripture-cards">{GNOSIS_PASSAGES.map(passage => <ScriptureCard key={passage.reference} passage={passage} />)}</div>
                    </section>
                    <section id="mission" tabIndex={-1} className="about-mission" aria-labelledby="mission-heading">
                        <p className="about-editorial-eyebrow">OUR MISSION</p>
                        <h2 id="mission-heading" data-about-reveal>Our Mission</h2>
                        <p className="about-statement">Make biblical knowledge more accessible and encourage thoughtful study of Scripture through its theological and historical context.</p>
                        <p>Today, Gnosis brings Scripture alongside the commentary of Matthew Henry and Jamieson, Fausset &amp; Brown, with personal notes, bookmarks, and highlights for your study.</p>
                        <p className="about-study-note">Commentary is a study aid. It is not inspired Scripture, an error-free authority, or a substitute for reading the biblical text itself.</p>
                    </section>
                    <section id="vision" tabIndex={-1} className="about-vision" aria-labelledby="vision-heading">
                        <p className="about-editorial-eyebrow">LOOKING AHEAD</p>
                        <h2 id="vision-heading" data-about-reveal>Our Vision</h2>
                        <p className="about-statement">Build an interconnected Christian research and learning platform encompassing Scripture, theology, biblical and church history, original languages, hymns, and historical sermons.</p>
                        <p>These connections represent our long-term vision, not a list of features currently available. Scripture and commentary remain the starting point.</p>
                        <Link to="/bible/Genesis/1" className="landing-btn about-study-button">Explore Scripture →</Link>
                    </section>
                </div>
            </main>
            <LandingFooter />
        </div>
    );
}
