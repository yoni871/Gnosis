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
// "<to> the light", "and <obj.>", "[that] which" — are STEPBible's own
// convention for supplied words and are kept verbatim.

// A gloss counts as present only when it has content beyond a
// bracketed placeholder.
export function hasGloss(gloss) {
    const trimmed = (gloss || "").trim();
    return trimmed !== "" && !/^<[^<>]*>$/.test(trimmed);
}

// The gloss to display in the Meaning column and detail panel: the
// gloss itself, or an em dash when the word has no standalone gloss.
export function displayGloss(gloss) {
    return hasGloss(gloss) ? gloss : "—";
}
