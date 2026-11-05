import { BookOpen, Layers, BookMarked } from "lucide-react";
import { Link } from "react-router-dom";
import "./LandingBibleCommentary.css";
import LandingDeviceShowcase from "./LandingDeviceShowcase";

const FEATURES = [
    { title: "Read with Understanding", text: "Explore Scripture alongside trusted commentary, gaining insight into the meaning and context of each passage.", Icon: BookOpen },
    { title: "Explore Different Perspectives", text: "Engage with the writings of Matthew Henry and Jamieson, Fausset & Brown.", Icon: Layers },
    { title: "Stay Focused on Scripture", text: "Move between the biblical text and commentary without losing your place.", Icon: BookMarked },
];

export default function LandingBibleCommentary() {
    return (
        <section id="how-it-works" className="landing-bible" aria-labelledby="landing-bible-heading">
            <div className="landing-bible-inner">
                <div className="landing-bible-copy">
                    <p className="landing-bible-eyebrow">EXPLORE SCRIPTURE</p>
                    <h2 id="landing-bible-heading">Scripture and Wisdom, Side by Side.</h2>
                    <p className="landing-bible-description">Explore God's Word alongside trusted biblical commentary. Move seamlessly between Scripture and the insights of Christian thinkers, discovering greater clarity and depth in every passage.</p>
                    <ul className="landing-bible-features">
                        {FEATURES.map(({ title, text, Icon }) => (
                            <li key={title}>
                                <Icon aria-hidden="true" />
                                <div><h3>{title}</h3><p>{text}</p></div>
                            </li>
                        ))}
                    </ul>
                    <Link className="landing-btn landing-bible-cta" to="/bible/Genesis/1">Explore Scripture →</Link>
                </div>
                <LandingDeviceShowcase />
            </div>
            <svg className="landing-bible-landscape" viewBox="0 0 1440 100" preserveAspectRatio="none" aria-hidden="true">
                <path d="M0 80Q230 10 480 65T960 60T1440 45V100H0Z" fill="currentColor" />
                <path d="M0 90Q320 55 620 82T1120 70T1440 85" fill="none" stroke="currentColor" />
            </svg>
        </section>
    );
}
