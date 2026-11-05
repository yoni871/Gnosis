import { Link } from "react-router-dom";
import LandingHeader from "../components/LandingHeader";
import PublicFooter from "../components/PublicFooter";
import Seo from "../components/Seo";
import { pageUrl } from "../utils/seo";
import "./LandingPage.css";

const PRINCIPLES = [
    ["Scripture first", "The biblical text is the starting point and remains primary throughout your study."],
    ["Context matters", "Read a verse within its passage, and take time to consider the surrounding chapter."],
    ["Commentary is a tool", "Historical interpretations can help you ask better questions. They are not a replacement for Scripture or a claim to error-free understanding."],
    ["Thoughtful study takes time", "There is no need to rush. Return to a passage, read carefully, and allow room for reflection."],
    ["Make room for reflection", "Personal notes, bookmarks, and highlights help you revisit passages and the questions they raise."],
];

export default function AboutPage() {
    return (
        <div className="public-page about-page">
            <Seo
                title="About Gnosis | Scripture, Commentary & Thoughtful Study"
                description="Learn about Gnosis, a Christian Bible study application bringing Scripture, classic commentary, notes, bookmarks, and highlights into one focused space."
                canonical={pageUrl("/about")}
            />
            <LandingHeader />
            <main id="landing-main" tabIndex={-1}>
                <section className="about-intro" aria-labelledby="about-title">
                    <div className="public-container">
                        <p className="public-eyebrow">Scripture. Context. Reflection.</p>
                        <h1 id="about-title">About Gnosis</h1>
                        <p className="about-lede">Gnosis is a Bible study application built to help readers explore Scripture with clarity, context, and thoughtful reflection.</p>
                        <p className="about-intro-note">A Christian Scripture-study application. A focused place to read, consider, and return.</p>
                    </div>
                </section>

                <div className="about-layout public-container">
                    <nav className="about-contents" aria-label="On this page">
                        <p className="public-eyebrow">On this page</p>
                        <a href="#mission">Our mission</a>
                        <a href="#provides">What Gnosis provides</a>
                        <a href="#name">Why the name?</a>
                        <a href="#sources">Commentary sources</a>
                        <a href="#principles">Study principles</a>
                    </nav>
                    <div className="about-reading">
                        <section id="mission" aria-labelledby="mission-heading">
                            <p className="public-section-number" aria-hidden="true">01 / Our purpose</p>
                            <h2 id="mission-heading">Careful study, made more accessible</h2>
                            <p>Our goal is to make careful Bible study more accessible by bringing Scripture, classic commentary, and personal study tools together in one focused space.</p>
                            <p>Gnosis is designed for readers who want to understand God’s Word more deeply: to read a passage closely, explore its context, and reflect on what they have read.</p>
                        </section>
                        <section id="provides" aria-labelledby="provides-heading">
                            <p className="public-section-number" aria-hidden="true">02 / Your study space</p>
                            <h2 id="provides-heading">The text and tools, together</h2>
                            <p>Read the Bible alongside verse-by-verse commentary without losing your place. Choose a passage, compare it with a classic commentator’s observations, and keep the biblical text in view.</p>
                            <div className="about-tools">
                                <article><h3>Read with context</h3><p>Explore Scripture and online Bible commentary side by side in a focused reader.</p></article>
                                <article><h3>Keep your reflections</h3><p>Use notes, bookmarks, and highlights to organize your personal study and return to meaningful passages.</p></article>
                            </div>
                        </section>
                        <section id="name" className="about-name" aria-labelledby="name-heading">
                            <p className="public-section-number" aria-hidden="true">03 / The name</p>
                            <h2 id="name-heading">Knowledge rooted in Scripture</h2>
                            <p>The Greek word <em>gnosis</em> means knowledge. For this application, the name reflects the pursuit of knowing and understanding Scripture through careful reading.</p>
                            <p>Gnosis is not connected to Gnosticism or its teachings. The application is a Christian Bible-study companion, centered on Scripture and thoughtful reflection.</p>
                        </section>
                        <section id="sources" aria-labelledby="sources-heading">
                            <p className="public-section-number" aria-hidden="true">04 / Historical perspectives</p>
                            <h2 id="sources-heading">Classic commentary, thoughtfully used</h2>
                            <p>Gnosis makes classic public-domain commentary available alongside the biblical text. These works offer historical perspectives and assistance for study.</p>
                            <article className="about-source"><h3>Matthew Henry</h3><p>Read Matthew Henry’s classic commentary for explanations and reflections on biblical passages.</p></article>
                            <article className="about-source"><h3>Jamieson, Fausset &amp; Brown</h3><p>Explore <em>Commentary Critical and Explanatory on the Whole Bible</em>, by Robert Jamieson, A. R. Fausset, and David Brown.</p></article>
                            <p className="about-source-note">Commentary is a study aid. It is not inspired Scripture, an error-free authority, or a substitute for reading the biblical text itself.</p>
                        </section>
                        <section id="principles" aria-labelledby="principles-heading">
                            <p className="public-section-number" aria-hidden="true">05 / A thoughtful approach</p>
                            <h2 id="principles-heading">Principles for a focused study</h2>
                            <ol className="about-principles">
                                {PRINCIPLES.map(([title, text]) => <li key={title}><h3>{title}</h3><p>{text}</p></li>)}
                            </ol>
                        </section>
                    </div>
                </div>
                <section className="landing-section landing-final-cta" aria-labelledby="about-cta-heading">
                    <p className="public-eyebrow">Begin with the text</p>
                    <h2 id="about-cta-heading">Make space for Scripture.</h2>
                    <p>Open a passage. Read carefully. Follow the questions that help you understand.</p>
                    <Link to="/bible/Genesis/1" className="landing-btn landing-btn-primary landing-btn-large">Start Studying</Link>
                </section>
            </main>
            <PublicFooter />
        </div>
    );
}
