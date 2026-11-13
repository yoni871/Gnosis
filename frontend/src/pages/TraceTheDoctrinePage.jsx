import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import LandingHeader from "../components/LandingHeader";
import Seo from "../components/Seo";
import { DOCTRINES, searchDoctrines } from "../data/doctrines";
import { doctrineIndexDescription, doctrineIndexTitle, pageUrl } from "../utils/seo";
import "./LandingPage.css";
import "./TraceTheDoctrinePage.css";

// Trace the Doctrine homepage ONLY. The interactive doctrine study
// workspace does not exist yet and no Trinity study content has been
// written, so nothing on this page may imply otherwise: "Begin
// Exploring" scrolls to the directory of planned categories, every
// category carries a Coming Soon state, and the search covers only
// the six planned categories listed on this page.

const ERAS = ["Scripture", "Early Church", "Councils", "Reformation", "Today"];

function scrollToDoctrines(event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const target = document.getElementById("doctrines");
    if (!target?.scrollIntoView) return;
    event.preventDefault();
    if (window.location.hash !== "#doctrines") window.history.pushState(null, "", "#doctrines");
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "instant" : "smooth", block: "start" });
}

function useReveal(rootRef) {
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return undefined;
        const targets = root.querySelectorAll("[data-doctrine-reveal]");
        if (!("IntersectionObserver" in window)) {
            // No observer (old browser, tests): content stays visible.
            targets.forEach((el) => el.classList.add("is-visible"));
            return undefined;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                        observer.unobserve(entry.target);
                    }
                }
            },
            { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
        );
        root.querySelectorAll("[data-doctrine-reveal]").forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, [rootRef]);
}

export default function TraceTheDoctrinePage() {
    const pageRef = useRef(null);
    const [query, setQuery] = useState("");
    const results = useMemo(() => searchDoctrines(query), [query]);
    const searching = query.trim().length > 0;
    useReveal(pageRef);

    return (
        <div className="public-page doctrine-home" ref={pageRef}>
            <Seo title={doctrineIndexTitle()} description={doctrineIndexDescription()} canonical={pageUrl("/trace-the-doctrine")} />
            {/* The hero header is ivory-on-transparent, designed to sit
                over a dark hero; this page's hero is light parchment,
                so the solid warm band (same hero+solid combination as
                the BH study pages) keeps the navigation readable. */}
            <LandingHeader hero solid />
            <main id="landing-main" tabIndex={-1}>
                <section className="doctrine-hero" aria-labelledby="doctrine-hero-heading">
                    <div className="doctrine-hero-inner">
                        <p className="doctrine-eyebrow"><span aria-hidden="true">—</span> Gnosis · Theology Through History <span aria-hidden="true">—</span></p>
                        <h1 id="doctrine-hero-heading">Trace the <em>Doctrine</em></h1>
                        <p className="doctrine-hero-sub">From Scripture, through centuries of Christian thought.</p>
                        <p className="doctrine-hero-lede">Explore how Christian doctrines have been understood, explained, and debated throughout church history — beginning with the biblical text.</p>
                        <form
                            className="doctrine-search"
                            role="search"
                            onSubmit={(event) => {
                                event.preventDefault();
                                document.getElementById("doctrines")?.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
                            }}
                        >
                            <label className="doctrine-search-label" htmlFor="doctrine-search-input">
                                Search planned doctrines
                            </label>
                            <div className="doctrine-search-field">
                                <Search size={18} aria-hidden="true" />
                                <input
                                    id="doctrine-search-input"
                                    type="search"
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Search the six planned doctrines…"
                                    autoComplete="off"
                                />
                                {searching && (
                                    <button type="button" className="doctrine-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
                                        ×
                                    </button>
                                )}
                            </div>
                            <p className="doctrine-search-note" aria-live="polite">
                                {searching
                                    ? results.length === 0
                                        ? `No planned doctrines match “${query.trim()}”.`
                                        : `Showing ${results.length} of ${DOCTRINES.length} planned doctrines.`
                                    : "Search covers the planned doctrines below — no studies are published yet."}
                            </p>
                        </form>
                        <ol className="doctrine-thread" aria-label="The thread this page will follow, from Scripture to today">
                            {ERAS.map((era, index) => (
                                <li key={era}>
                                    <span className="doctrine-thread-dot" aria-hidden="true" />
                                    <span className="doctrine-thread-era">{era}</span>
                                    {index < ERAS.length - 1 && <span className="doctrine-thread-line" aria-hidden="true" />}
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>

                <section className="doctrine-featured" aria-labelledby="doctrine-featured-heading" data-doctrine-reveal>
                    <div className="doctrine-featured-inner">
                        <div className="doctrine-featured-copy">
                            <p className="doctrine-eyebrow doctrine-eyebrow--light">Featured Doctrine</p>
                            <h2 id="doctrine-featured-heading">The Trinity</h2>
                            <p className="doctrine-featured-desc">Trace biblical passages and their interpretation from the early Church through major theological controversies and councils.</p>
                            <p className="doctrine-featured-soon"><span className="doctrine-pill doctrine-pill--light">Coming Soon</span> The study workspace is not yet available — this page introduces the planned study.</p>
                            <a className="doctrine-featured-action" href="#doctrines" onClick={scrollToDoctrines}>Begin Exploring <span aria-hidden="true">↓</span></a>
                        </div>
                        <div className="doctrine-featured-traced">
                            <p className="doctrine-featured-traced-kicker">Traced through</p>
                            <ul>
                                <li>
                                    <span className="doctrine-traced-numeral" aria-hidden="true">i</span>
                                    <div>
                                        <Link to="/bible/Genesis/1">Genesis 1:26</Link>
                                        <p>“Let us make man in our image.”</p>
                                    </div>
                                </li>
                                <li>
                                    <span className="doctrine-traced-numeral" aria-hidden="true">ii</span>
                                    <div>
                                        <Link to="/bible/Matthew/28">Matthew 28:19</Link>
                                        <p>Baptizing in the name of the Father, the Son, and the Holy Spirit.</p>
                                    </div>
                                </li>
                                <li>
                                    <span className="doctrine-traced-numeral" aria-hidden="true">iii</span>
                                    <div>
                                        <strong>Historical Timeline</strong>
                                        <p>From the early Church through the councils — coming with the study.</p>
                                    </div>
                                </li>
                            </ul>
                        </div>
                    </div>
                </section>

                <section id="doctrines" className="doctrine-directory" aria-labelledby="doctrine-directory-heading" data-doctrine-reveal>
                    <header className="doctrine-directory-head">
                        <p className="doctrine-eyebrow">Explore Doctrines</p>
                        <h2 id="doctrine-directory-heading">Six Doctrines, One Thread</h2>
                        <p>Planned categories for future studies. Each will trace its doctrine from the biblical text through centuries of Christian thought — none is published yet.</p>
                    </header>
                    {results.length === 0 ? (
                        <div className="doctrine-empty" role="status">
                            <p>No planned doctrines match your search.</p>
                            <button type="button" className="doctrine-empty-clear" onClick={() => setQuery("")}>Show all planned doctrines</button>
                        </div>
                    ) : (
                        <ul className="doctrine-grid">
                            {results.map((doctrine) => (
                                <li key={doctrine.id}>
                                    <article className="doctrine-card">
                                        <div className="doctrine-card-top">
                                            <span className="doctrine-card-numeral" aria-hidden="true">{doctrine.numeral}</span>
                                            <span className="doctrine-pill">Coming Soon</span>
                                        </div>
                                        <h3>{doctrine.title}</h3>
                                        <p>{doctrine.description}</p>
                                        {doctrine.featured && <p className="doctrine-card-featured">Featured above</p>}
                                    </article>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="doctrine-note" aria-labelledby="doctrine-note-heading" data-doctrine-reveal>
                    <h2 id="doctrine-note-heading">What You Can Explore Today</h2>
                    <p>While the doctrine studies are being prepared, Scripture and its history are already open: read the Bible alongside trusted commentary, or explore the ancient world behind the biblical story.</p>
                    <p className="doctrine-note-links">
                        <Link to="/bible/Genesis/1">Bible &amp; Commentary <span aria-hidden="true">→</span></Link>
                        <Link to="/biblical-history">Biblical History <span aria-hidden="true">→</span></Link>
                    </p>
                </section>
            </main>
        </div>
    );
}
