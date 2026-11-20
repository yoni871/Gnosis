// The Trinity study workspace: the first Trace the Doctrine study.
//
// A preview, not a publication: the page is noindex, the route is
// never listed in the sitemap, and the theologian entries in the
// workspace are demonstration data pending research (see
// src/data/doctrineStudies.js). The page itself carries no study
// content — the workspace owns the passage, interpretation, and
// timeline state.
import { useEffect, useRef } from "react";
import LandingHeader from "../components/LandingHeader";
import Seo from "../components/Seo";
import DoctrineWorkspace from "../components/Doctrine/DoctrineWorkspace";
import { doctrineStudyDescription, doctrineStudyTitle, pageUrl } from "../utils/seo";
import "./TraceTheDoctrinePage.css";
import "./TraceTheDoctrineTrinityPage.css";

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
        root.classList.add("doctrine-reveal-ready");
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
        return () => { observer.disconnect(); root.classList.remove("doctrine-reveal-ready"); };
    }, [rootRef]);
}

export default function TraceTheDoctrineTrinityPage() {
    const pageRef = useRef(null);
    useReveal(pageRef);

    return (
        <div className="public-page doctrine-study" ref={pageRef}>
            <Seo
                title={doctrineStudyTitle("The Trinity")}
                description={doctrineStudyDescription("The Trinity")}
                canonical={pageUrl("/trace-the-doctrine/trinity")}
                robots="noindex, nofollow"
            />
            <LandingHeader hero solid />
            <main id="landing-main" tabIndex={-1}>
                <header className="doctrine-study-head" aria-labelledby="doctrine-study-heading" data-doctrine-reveal>
                    <p className="doctrine-eyebrow"><span aria-hidden="true">—</span> Gnosis · Trace the Doctrine <span aria-hidden="true">—</span></p>
                    <h1 id="doctrine-study-heading">The Trinity</h1>
                    <p className="doctrine-study-sub">From Scripture through Christian history</p>
                </header>
                <div className="doctrine-study-workspace-wrap" data-doctrine-reveal>
                    <DoctrineWorkspace />
                </div>
            </main>
        </div>
    );
}
