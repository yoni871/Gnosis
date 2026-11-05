import { BookOpen, Landmark } from "lucide-react";
import "./LandingPurpose.css";

function ChiRho() {
    return (
        <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M16 29V3h3a6 6 0 0 1 0 12h-3M7 9l18 18M25 9 7 27" />
        </svg>
    );
}

const PILLARS = [
    { number: "01", title: "SCRIPTURE", Icon: BookOpen, text: "The foundation of everything we explore." },
    { number: "02", title: "THEOLOGY", Icon: ChiRho, text: "Understanding the faith through Scripture and centuries of Christian thought." },
    { number: "03", title: "HISTORY", Icon: Landmark, text: "Discovering the people, events, and civilizations that shaped the biblical world and the history of Christianity." },
];

export default function LandingPurpose() {
    return (
        <section className="landing-purpose" aria-labelledby="landing-purpose-heading">
            <div className="landing-purpose-inner">
                <div className="landing-purpose-ornament" aria-hidden="true">
                    <span />
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                        <path d="M12 3v18M6 9h12M10 3h4M10 21h4M6 7v4M18 7v4" />
                    </svg>
                    <span />
                </div>
                <p className="landing-purpose-eyebrow">THE PURPOSE BEHIND GNOSIS</p>
                <h2 id="landing-purpose-heading">A Deeper Way to Explore Christian Knowledge.</h2>
                <p className="landing-purpose-intro">
                    Scripture is our starting point. Gnosis seeks to bring together biblical study, theology, and history—making centuries of Christian knowledge more accessible and interconnected.
                </p>
                <div className="landing-purpose-pillars">
                    {PILLARS.map(({ number, title, Icon, text }) => (
                        <div className="landing-purpose-pillar" key={number}>
                            <div className="landing-purpose-icon" aria-hidden="true"><Icon /></div>
                            <h3><span>{number} —</span>{" "}{title}</h3>
                            <p>{text}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
