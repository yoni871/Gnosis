import { Link } from "react-router-dom";
import { chapterPath } from "../utils/seo";
import "./LandingExplore.css";

const PASSAGES = [
    { book: "Genesis", chapter: 1, label: "Genesis 1", subtitle: "In the Beginning" },
    { book: "Psalms", chapter: 23, label: "Psalm 23", subtitle: "The Lord Is My Shepherd" },
    { book: "Isaiah", chapter: 53, label: "Isaiah 53", subtitle: "The Suffering Servant" },
    { book: "John", chapter: 1, label: "John 1", subtitle: "The Word Became Flesh" },
    { book: "Romans", chapter: 8, label: "Romans 8", subtitle: "Life in the Spirit" },
    { book: "Revelation", chapter: 21, label: "Revelation 21", subtitle: "All Things Made New" },
];

export default function LandingExplore({ passages = PASSAGES }) {
    return (
        <section id="explore" className="landing-explore-final" aria-labelledby="landing-explore-heading">
            <div className="landing-explore-final-inner">
                <p className="closing-eyebrow">BEGIN EXPLORING</p>
                <h2 id="landing-explore-heading">Every Journey Begins with a Passage.</h2>
                <p className="closing-description">From the opening words of Genesis to the final chapter of Revelation, discover Scripture alongside trusted commentary.</p>
                <ul className="closing-passages" aria-label="Choose a passage" role="list">
                    {passages.map(({ book, chapter, label, subtitle }) => (
                        <li key={`${book}-${chapter}`}>
                            <Link className="closing-passage" to={chapterPath(book, chapter)}>
                                <h3>{label}</h3>
                                <span className="closing-passage-rule" aria-hidden="true" />
                                <p><em>{subtitle}</em></p>
                                <span className="closing-passage-arrow" aria-hidden="true">→</span>
                            </Link>
                        </li>
                    ))}
                </ul>
                <div className="closing-invitation">
                    <span aria-hidden="true" />
                    <p><em>Or begin wherever Scripture leads you.</em></p>
                    <span aria-hidden="true" />
                </div>
                <Link className="landing-btn closing-explore-button" to={chapterPath("Genesis", 1)}>Explore the Bible →</Link>
            </div>
        </section>
    );
}
