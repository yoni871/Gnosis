import { useEffect } from "react";

// Minimal document-head manager: no extra dependency, just the tags
// search engines actually read. Every route renders <Seo>, so a route
// change always replaces the previous route's tags; there is no stale
// title or canonical left behind by client-side navigation.
//
// This sets metadata for JavaScript-capable crawlers (including
// Googlebot, which renders pages). It does not put chapter content in
// the initial HTML shell -- see docs/SEO.md for the prerendering plan
// that closes that gap.

function upsertMeta(attr, value, content) {
    const selector = `meta[${attr}="${value}"]`;
    let element = document.head.querySelector(selector);

    if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attr, value);
        document.head.appendChild(element);
    }

    element.setAttribute("content", content);
}

function upsertLink(rel, href) {
    let element = document.head.querySelector(`link[rel="${rel}"]`);

    if (!element) {
        element = document.createElement("link");
        element.setAttribute("rel", rel);
        document.head.appendChild(element);
    }

    element.setAttribute("href", href);
}

export default function Seo({
    title,
    description,
    canonical,
    robots = "index, follow",
    ogType = "website",
}) {
    useEffect(() => {
        document.title = title;

        upsertMeta("name", "description", description);
        upsertMeta("name", "robots", robots);
        upsertMeta("property", "og:title", title);
        upsertMeta("property", "og:description", description);
        upsertMeta("property", "og:type", ogType);
        upsertMeta("property", "og:site_name", "Gnosis");
        upsertMeta("name", "twitter:card", "summary");
        upsertMeta("name", "twitter:title", title);
        upsertMeta("name", "twitter:description", description);

        if (canonical) {
            upsertLink("canonical", canonical);
            upsertMeta("property", "og:url", canonical);
        }
    }, [title, description, canonical, robots, ogType]);

    return null;
}
