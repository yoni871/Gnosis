// NLT provider — Tyndale's NLT API (api.nlt.to).
//
// Terms (read 2026-11-06, re-check before changing a cap or a notice):
// - Free for non-commercial use with a key: at most 500 verses per
//   request, 5,000 requests a day. Anonymous use (no key) is 50 verses
//   per request and 500 a day — the provider always sends a key, so a
//   missing NLT_API_KEY is a configuration error, not a silent fallback.
// - Tyndale allows quoting up to 500 verses without written permission,
//   never a complete book. One chapter is always within that.
// - The standard NLT notice travels with the translation row.
//
// The /api/passages endpoint returns an HTML excerpt. Each verse is a
// <verse_export ... vn="N"> block; the verse number is a <span class="vn">
// inside it, footnotes ride in <span class="tn"> blocks with an
// <a class="a-tn">*</a> marker, and the chapter-number heading sits inside
// verse 1's block. The parser removes all of that markup before stripping
// the remaining tags. (Response shape verified live against the anonymous
// TEST key, John 3, 2026-11-06.)

const NLT_API_URL = "https://api.nlt.to/api/passages";
const { LicensedProviderError } = require("./esvProvider");

function decodeEntities(text) {
    return text
        .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, " ");
}

// Strip one verse's HTML to plain text. Footnotes nest spans inside spans
// (<span class="tn"><span class="tn-ref">…</span> …</span>), so a plain
// regex cannot remove them: this walks the tags and skips a footnote,
// number span, or heading together with everything nested inside it.
function stripNltVerseHtml(inner) {
    const skipped = [];
    let out = "";
    const tokenPattern = /<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
    let match;
    while ((match = tokenPattern.exec(inner || "")) !== null) {
        if (match[4] !== undefined) {
            if (skipped.length === 0) {
                out += match[4];
            }
            continue;
        }
        const closing = match[1] === "/";
        const tag = match[2].toLowerCase();
        const attrs = match[3] || "";
        const voidElement = attrs.trim().endsWith("/") || tag === "br" || tag === "hr" || tag === "img";
        if (closing) {
            const top = skipped[skipped.length - 1];
            if (top && top.tag === tag) {
                top.depth -= 1;
                if (top.depth === 0) {
                    skipped.pop();
                }
            }
            continue;
        }
        if (skipped.length > 0) {
            const top = skipped[skipped.length - 1];
            if (top.tag === tag && !voidElement) {
                top.depth += 1;
            }
            continue;
        }
        const isSkippedElement =
            (tag === "span" && /class="tn"/.test(attrs)) ||
            (tag === "a" && /class="a-tn"/.test(attrs)) ||
            (tag === "span" && /class="vn"/.test(attrs)) ||
            tag === "h2" || tag === "h3";
        if (isSkippedElement && !voidElement) {
            skipped.push({ tag, depth: 1 });
            continue;
        }
        if (tag === "p" || tag === "br") {
            out += " ";
        }
    }
    return decodeEntities(out).replace(/\s+/g, " ").trim();
}

// Split an NLT passages HTML document into {verse_number, text} rows.
function parseNltHtml(html) {
    const verses = [];
    const blockPattern = /<verse_export[^>]*\svn="(\d+)"[^>]*>([\s\S]*?)<\/verse_export>/g;
    let match;
    while ((match = blockPattern.exec(html || "")) !== null) {
        const text = stripNltVerseHtml(match[2]);
        if (!text) {
            throw new LicensedProviderError(
                "provider-format",
                `NLT response has an empty verse ${match[1]}.`
            );
        }
        verses.push({ verse_number: parseInt(match[1], 10), text });
    }
    if (verses.length === 0) {
        throw new LicensedProviderError(
            "provider-format",
            "NLT response contained no verses."
        );
    }
    for (let i = 0; i < verses.length; i += 1) {
        if (verses[i].verse_number !== i + 1) {
            throw new LicensedProviderError(
                "provider-format",
                `NLT verses are not consecutive from 1 (got ${verses[i].verse_number} at position ${i + 1}).`
            );
        }
    }
    return verses;
}

async function fetchNltChapter(book, chapter, options = {}) {
    const apiKey = options.apiKey || process.env.NLT_API_KEY;
    if (!apiKey) {
        throw new LicensedProviderError(
            "key-missing",
            "NLT_API_KEY is not configured."
        );
    }
    const fetchImpl = options.fetchImpl || fetch;
    const params = new URLSearchParams({
        ref: `${book}.${chapter}`,
        key: apiKey,
    });
    let response;
    try {
        response = await fetchImpl(`${NLT_API_URL}?${params.toString()}`);
    } catch (error) {
        throw new LicensedProviderError(
            "provider",
            `NLT request failed: ${error.message}`
        );
    }
    if (!response.ok) {
        throw new LicensedProviderError(
            "provider",
            `NLT request failed with HTTP ${response.status}.`
        );
    }
    const html = await response.text();
    return { verses: parseNltHtml(html), fumsToken: null };
}

module.exports = { fetchNltChapter, parseNltHtml };
