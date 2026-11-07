import KnowledgeDiagram from "./KnowledgeDiagram";
import "./LandingBeyondText.css";

export default function LandingBeyondText() {
    return (
        <section className="landing-beyond" aria-labelledby="landing-beyond-heading">
            <div className="landing-beyond-inner">
                <div className="landing-beyond-copy">
                    <p className="landing-beyond-eyebrow">BEYOND THE TEXT</p>
                    <h2 id="landing-beyond-heading">One Passage. A World of Understanding.</h2>
                    <p className="landing-beyond-description">Explore the connections between Scripture, the historical world, and centuries of Christian thought.</p>
                </div>
                <KnowledgeDiagram />
            </div>
        </section>
    );
}
