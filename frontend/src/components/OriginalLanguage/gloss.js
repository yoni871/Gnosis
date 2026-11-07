// Gloss display rules for the Original Language modal.
//
// STEPBible marks a word that has no standalone English rendering with
// a gloss wrapped entirely in angle brackets — "<the>" for the Greek
// article, "<obj.>" for the Hebrew object marker. That is a
// placeholder, not a definition: printing it as the word's meaning
// would present the placeholder as if the word meant "the". Such
// glosses (and genuinely empty ones) are shown as an em dash instead,
// without inventing a definition.
//
// Glosses that mix bracketed supplied words with real content —
// "<to> the light", "[that] which" — are STEPBible's own convention
// for supplied words and are kept verbatim.
//
// One bracketed token is not a supplied word: "<obj.>" is a
// grammatical label (the object marker), and it also appears inside
// mixed glosses ("and <obj.>", "<obj.> them"). An angle-bracketed
// segment ending in a period is such a label, not a word, so it is
// stripped and the leftover whitespace collapsed; the Grammar column
// already states the object-marker role, so nothing is lost. If
// stripping leaves nothing, the gloss is an em dash.

// Strip angle-bracketed label segments ("<obj.>") from a gloss.
function stripLabelSegments(gloss) {
    return gloss.replace(/<[^<>]*\.>/g, "").replace(/\s+/g, " ").trim();
}

// A gloss counts as present only when it has content beyond a
// bracketed placeholder.
export function hasGloss(gloss) {
    const cleaned = stripLabelSegments((gloss || "").trim());
    return cleaned !== "" && !/^<[^<>]*>$/.test(cleaned);
}

// The gloss to display in the Meaning column and detail panel: the
// gloss itself (labels stripped), or an em dash when the word has no
// standalone gloss.
export function displayGloss(gloss) {
    if (!hasGloss(gloss)) return "—";
    return stripLabelSegments(gloss.trim());
}
