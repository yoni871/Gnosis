import { useRef } from "react";
import { Link } from "react-router-dom";
import LandingHeader from "../components/LandingHeader";
import HistoryBookSelector from "../components/History/HistoryBookSelector";
import Seo from "../components/Seo";
import useHistoryHomeMotion from "../hooks/useHistoryHomeMotion";
import { historyIndexDescription, historyIndexTitle, historyPath, pageUrl } from "../utils/seo";
import "./LandingPage.css";
import "../components/History/History.css";

const EXPLORATION_STEPS = [
    ["01", "Read", "Explore the biblical account alongside its historical explanation."],
    ["02", "Understand", "Discover relevant historical context and scholarly perspectives."],
    ["03", "Connect", "Follow Scripture references and connections between events."],
    ["04", "Explore", "Move through biblical events and historical periods."],
];

function scrollToStart(event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const target = document.getElementById("history-start");
    if (!target?.scrollIntoView) return;
    event.preventDefault();
    if (window.location.hash !== "#history-start") window.history.pushState(null, "", "#history-start");
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "instant" : "smooth", block: "start" });
}

export default function BiblicalHistoryIndexPage() {
    const pageRef = useRef(null);
    useHistoryHomeMotion(pageRef);

    return (
        <div className="public-page history-home" ref={pageRef}>
            <link rel="preload" href="/fonts/hero/cormorant-garamond-latin-600.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
            <link rel="preload" href="/fonts/hero/inter-latin-variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
            <Seo title={historyIndexTitle()} description={historyIndexDescription()} canonical={pageUrl("/biblical-history")} />
            <LandingHeader hero />
            <main id="landing-main" tabIndex={-1}>
                <section className="history-hero" aria-labelledby="history-hero-heading">
                    <div className="history-hero-grain" aria-hidden="true" />
                    <div className="history-hero-inner">
                        <div className="history-hero-copy">
                            <p className="history-home-eyebrow">Biblical History · Gnosis</p>
                            <h1 id="history-hero-heading"><span>Discover the History</span>{" "}<span>Behind Scripture.</span></h1>
                            <p className="history-hero-lede">Explore the people, events, cultures, and historical settings of the Bible—and see how they connect across Scripture.</p>
                            <a className="history-home-action" href="#history-start" onClick={scrollToStart}>Start Exploring <span aria-hidden="true">↓</span></a>
                        </div>
                        <div className="history-hero-archive" aria-hidden="true">
                            <div className="history-archive-orbit history-archive-orbit--outer" />
                            <div className="history-archive-orbit history-archive-orbit--inner" />
                            <p className="history-archive-kicker">A chronicle of</p>
                            <p className="history-archive-title">The Biblical World</p>
                            <div className="history-archive-rule" />
                            <ol>
                                <li><span>01</span><b>Creation</b></li><li><span>02</span><b>Patriarchs</b></li>
                                <li><span>03</span><b>Exodus</b></li><li><span>04</span><b>Kingdom</b></li>
                            </ol>
                            <p className="history-archive-mark">Scripture · Context · Connection</p>
                        </div>
                    </div>
                    <p className="history-hero-scroll" aria-hidden="true"><span /> Scroll to enter the story</p>
                </section>

                <section className="history-definition" aria-labelledby="history-definition-heading">
                    <div className="history-definition-index" data-history-reveal><span>01</span><span>Orientation</span></div>
                    <div className="history-definition-copy" data-history-reveal>
                        <p className="history-home-eyebrow">A wider view of the text</p>
                        <h2 id="history-definition-heading">What Is Biblical History?</h2>
                        <p>Biblical history explores the events recorded in Scripture and the historical world surrounding them. It helps us understand the biblical narrative in its literary, cultural, and historical contexts.</p>
                    </div>
                    <blockquote data-history-reveal><span aria-hidden="true">“</span>Scripture unfolds within real places, peoples, and moments in time.</blockquote>
                </section>

                <section className="history-journey" aria-labelledby="history-method-heading">
                    <header data-history-reveal>
                        <p className="history-home-eyebrow">A guided method</p>
                        <h2 id="history-method-heading">How Gnosis Helps You Explore</h2>
                        <p>Move from the biblical account to its historical setting, then follow the connections that bring the wider story into view.</p>
                    </header>
                    <ol className="history-home-steps">
                        {EXPLORATION_STEPS.map(([number, title, description]) => (
                            <li key={number} data-history-step><span className="history-home-step-number">{number}</span><div><h3>{title}</h3><p>{description}</p></div><span className="history-step-line" aria-hidden="true" /></li>
                        ))}
                    </ol>
                </section>

                <section id="history-start" className="history-home-start" aria-labelledby="history-start-heading">
                    <div className="history-start-heading" data-history-reveal><p className="history-home-eyebrow">Your first chapter</p><h2 id="history-start-heading">Where Should You Begin?</h2></div>
                    <article className="history-home-recommendation" data-history-reveal>
                        <div className="history-creation-number" aria-hidden="true">01</div>
                        <div className="history-creation-copy">
                            <p className="history-home-eyebrow">Recommended Starting Point</p><h3>The Beginning — Creation</h3>
                            <p className="history-home-reference">Genesis 1:1–2:3</p>
                            <p>Begin with the opening account of Scripture and explore the ancient-world context surrounding the biblical creation narrative.</p>
                            <Link className="history-home-action history-home-action--light" to={historyPath("genesis", "creation")}>Explore Creation <span aria-hidden="true">→</span></Link>
                        </div>
                        <div className="history-creation-seal" aria-hidden="true"><span>In the</span><b>Beginning</b><small>Genesis I</small></div>
                    </article>
                </section>

                <section id="history-books" className="history-scripture" aria-labelledby="history-books-heading">
                    <header data-history-reveal>
                        <div><p className="history-home-eyebrow">The complete collection</p><h2 id="history-books-heading">Explore by Scripture</h2></div>
                        <p>Choose a book of the Bible to explore its historical context and events.</p>
                    </header>
                    <div data-history-books-reveal>
                        <HistoryBookSelector />
                    </div>
                </section>
            </main>
        </div>
    );
}
