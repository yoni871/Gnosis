import { useEffect, useId, useRef, useState } from "react";

export default function AboutSectionNavigation({ sections }) {
    const [active, setActive] = useState(sections[0].id);
    const [open, setOpen] = useState(false);
    const menuId = useId();
    const button = useRef(null);
    const jump = (id, behavior) => {
        const target = document.getElementById(id);
        if (!target) return;
        target.focus({ preventScroll: true });
        target.scrollIntoView?.({ behavior, block: "start" });
    };
    useEffect(() => {
        let frame = 0;
        const update = () => {
            frame = 0;
            const offset = innerWidth < 900 ? 112 : 80;
            let next = sections[0].id;
            sections.forEach(({ id }) => {
                if (document.getElementById(id)?.getBoundingClientRect().top <= offset) next = id;
            });
            if (scrollY > 0 && scrollY + innerHeight >= document.documentElement.scrollHeight - 2) next = sections.at(-1).id;
            setActive(next);
        };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
        const restoreHash = () => {
            const id = window.location.hash.slice(1);
            if (sections.some(section => section.id === id)) jump(id, "instant");
            schedule();
        };
        restoreHash();
        window.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", schedule);
        window.addEventListener("hashchange", restoreHash);
        window.addEventListener("popstate", restoreHash);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("scroll", schedule);
            window.removeEventListener("resize", schedule);
            window.removeEventListener("hashchange", restoreHash);
            window.removeEventListener("popstate", restoreHash);
        };
    }, [sections]);
    const navigate = (event, id) => {
        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.button !== 0) return;
        if (!document.getElementById(id)?.scrollIntoView) return;
        event.preventDefault();
        if (location.hash !== `#${id}`) history.pushState(null, "", `#${id}`);
        setOpen(false);
        setActive(id);
        jump(id, window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth");
    };
    const links = () => sections.map(({ id, label }) => (
        <a key={id} href={`#${id}`} aria-current={active === id ? "location" : undefined} onClick={event => navigate(event, id)}>{label}</a>
    ));
    return (
        <aside className="about-section-navigation" onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }} onKeyDown={event => {
            if (event.key === "Escape" && open) { setOpen(false); button.current?.focus(); }
        }}>
            <nav className="about-sidebar" aria-label="On this page">{links()}</nav>
            <div className="about-mobile-contents">
                <button type="button" ref={button} aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(value => !value)}>
                    <span>On this page</span><span>{sections.find(section => section.id === active).label}<span aria-hidden="true"> {open ? "−" : "+"}</span></span>
                </button>
                {open && <nav id={menuId} aria-label="Page sections">{links()}</nav>}
            </div>
        </aside>
    );
}
