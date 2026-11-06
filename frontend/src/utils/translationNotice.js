// Copyright notice for the selected translation.
//
// The notice (and its link, where the licence asks for one) travels with
// the translation row from /translations, so the passage and its
// attribution can never drift apart. Stored translations have no notice
// and render nothing.
export function getTranslationNotice(translations, translation) {
    const selected = (translations || []).find(
        (item) => item.abbreviation === translation
    );
    if (!selected || !selected.notice) {
        return null;
    }
    let host = null;
    if (selected.notice_url) {
        try {
            host = new URL(selected.notice_url).hostname;
        } catch {
            // A malformed link must not break the passage render.
            host = null;
        }
    }
    return { text: selected.notice, url: selected.notice_url || null, host };
}
