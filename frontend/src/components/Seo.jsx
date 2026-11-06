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

function upsertJsonLd(jsonLd) {
    const selector = 'script[type="application/ld+json"][data-seo-jsonld]';
    let element = document.head.querySelector(selector);

    if (!jsonLd) {
        if (element) {
            element.remove();
        }
        return;
    }

    if (!element) {
        element = document.createElement("script");
        element.setAttribute("type", "application/ld+json");
        element.setAttribute("data-seo-jsonld", "");
        document.head.appendChild(element);
    }

    element.textContent = JSON.stringify(jsonLd);
}

function removeMeta(attr, value) {
    const element = document.head.querySelector(
        `meta[${attr}="${value}"]`,
    );
    if (element) {
        element.remove();
    }
}

export default function Seo({
    title,
    description,
    canonical,
    robots = "index, follow",
    ogType = "website",
    ogImage,
    ogImageWidth,
    ogImageHeight,
    ogImageAlt,
    twitterCard = "summary",
    jsonLd,
}) {
    useEffect(() => {
        document.title = title;

        upsertMeta("name", "description", description);
        upsertMeta("name", "robots", robots);
        upsertMeta("property", "og:title", title);
        upsertMeta("property", "og:description", description);
        upsertMeta("property", "og:type", ogType);
        upsertMeta("property", "og:site_name", "Gnosis");
        upsertMeta("name", "twitter:card", twitterCard);
        upsertMeta("name", "twitter:title", title);
        upsertMeta("name", "twitter:description", description);

        if (canonical) {
            upsertLink("canonical", canonical);
            upsertMeta("property", "og:url", canonical);
        }

        if (ogImage) {
            upsertMeta("property", "og:image", ogImage);
            upsertMeta("name", "twitter:image", ogImage);
            if (ogImageWidth != null) {
                upsertMeta(
                    "property",
                    "og:image:width",
                    String(ogImageWidth),
                );
            } else {
                removeMeta("property", "og:image:width");
            }
            if (ogImageHeight != null) {
                upsertMeta(
                    "property",
                    "og:image:height",
                    String(ogImageHeight),
                );
            } else {
                removeMeta("property", "og:image:height");
            }
            if (ogImageAlt != null) {
                upsertMeta("property", "og:image:alt", ogImageAlt);
            } else {
                removeMeta("property", "og:image:alt");
            }
        } else {
            removeMeta("property", "og:image");
            removeMeta("name", "twitter:image");
            removeMeta("property", "og:image:width");
            removeMeta("property", "og:image:height");
            removeMeta("property", "og:image:alt");
        }

        upsertJsonLd(jsonLd);
    }, [
        title,
        description,
        canonical,
        robots,
        ogType,
        ogImage,
        ogImageWidth,
        ogImageHeight,
        ogImageAlt,
        twitterCard,
        jsonLd,
    ]);

    return null;
}
