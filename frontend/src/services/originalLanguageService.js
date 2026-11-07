import API_URL from "../api/api";

// Original Language Analysis (Phase 1) — see docs/OriginalLanguage.md.
// The backend serves word-level Hebrew/Greek data for Genesis 1 and
// Philippians 3 only; other passages answer available:false.

async function readJson(response) {
    const body = await response.json();
    if (!response.ok) {
        throw new Error(body?.error || "Original-language request failed.");
    }
    return body;
}

export async function getOriginalLanguagePassage(book, chapter, startVerse, endVerse) {
    const response = await fetch(
        `${API_URL}/original-language/${encodeURIComponent(book)}/${chapter}?startVerse=${startVerse}&endVerse=${endVerse}`
    );
    return readJson(response);
}

export async function getOriginalLanguageWord(id) {
    const response = await fetch(`${API_URL}/original-language/words/${id}`);
    return readJson(response);
}

export async function getLemmaOccurrences(strong, { match = "lemma", limit = 20, offset = 0 } = {}) {
    const response = await fetch(
        `${API_URL}/original-language/lemmas/${encodeURIComponent(strong)}/occurrences?match=${match}&limit=${limit}&offset=${offset}`
    );
    return readJson(response);
}
