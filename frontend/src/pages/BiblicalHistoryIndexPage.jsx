import { Link } from "react-router-dom";
import Header from "../components/Header/Header";
import Seo from "../components/Seo";
import { historyIndexDescription, historyIndexTitle, historyPath, pageUrl } from "../utils/seo";
import "../components/History/History.css";

const EXPLORATION_STEPS = [
    ["01", "Read", "Explore the biblical account alongside its historical explanation."],
    ["02", "Understand", "Discover relevant historical context and scholarly perspectives."],
    ["03", "Connect", "Follow Scripture references and connections between events."],
    ["04", "Explore", "Move through biblical events and historical periods."],
];

export default function BiblicalHistoryIndexPage() {
    return (
        <div className="history-home min-h-screen bg-[var(--bg-page)] pt-[58px] text-[var(--text-primary)]">
            <Seo
                title={historyIndexTitle()}
                description={historyIndexDescription()}
                canonical={pageUrl("/biblical-history")}
            />
            <Header />
            <main className="history-home-main">
                <header className="history-home-intro">
                    <p className="history-home-eyebrow">Biblical History</p>
                    <h1>Discover the History Behind Scripture.</h1>
                    <p className="history-home-lede">
                        Explore the people, events, cultures, and historical settings of the Bible—and see how they connect across Scripture.
                    </p>
                    <a className="history-home-action" href="#history-start">Start Exploring</a>
                </header>

                <section className="history-home-section" aria-labelledby="history-definition-heading">
                    <h2 id="history-definition-heading">What Is Biblical History?</h2>
                    <p>
                        Biblical history explores the events recorded in Scripture and the historical world surrounding them. It helps us understand the biblical narrative in its literary, cultural, and historical contexts.
                    </p>
                </section>

                <section className="history-home-section" aria-labelledby="history-method-heading">
                    <h2 id="history-method-heading">How Gnosis Helps You Explore</h2>
                    <ol className="history-home-steps">
                        {EXPLORATION_STEPS.map(([number, title, description]) => (
                            <li key={number}>
                                <span className="history-home-step-number">{number}</span>
                                <div><h3>{title}</h3><p>{description}</p></div>
                            </li>
                        ))}
                    </ol>
                </section>

                <section id="history-start" className="history-home-section history-home-start" aria-labelledby="history-start-heading">
                    <h2 id="history-start-heading">Where Should You Begin?</h2>
                    <article className="history-home-recommendation">
                        <p className="history-home-eyebrow">Recommended Starting Point</p>
                        <h3>The Beginning — Creation</h3>
                        <p className="history-home-reference">Genesis 1:1–2:3</p>
                        <p>Begin with the opening account of Scripture and explore the ancient-world context surrounding the biblical creation narrative.</p>
                        <Link className="history-home-action" to={historyPath("genesis", "creation")}>Explore Creation</Link>
                    </article>
                </section>

                <section className="history-home-section history-home-more" aria-labelledby="history-more-heading">
                    <h2 id="history-more-heading">Explore More</h2>
                    <p>Or explore by Bible book.</p>
                    <Link className="history-home-text-link" to="/biblical-history/books">Browse Books</Link>
                </section>
            </main>
        </div>
    );
}
