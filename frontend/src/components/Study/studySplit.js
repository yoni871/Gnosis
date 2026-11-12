export const DEFAULT_STUDY_SPLIT = 60;
export const STUDY_SPLIT_STORAGE_KEY = "gnosis-study-split";
export const MIN_SCRIPTURE_WIDTH = 320;
export const MIN_COMMENTARY_WIDTH = 300;
export const DIVIDER_WIDTH = 8;

export function clampStudySplit(percent, width) {
    if (!Number.isFinite(percent)) return DEFAULT_STUDY_SPLIT;
    if (!Number.isFinite(width) || width <= MIN_SCRIPTURE_WIDTH + MIN_COMMENTARY_WIDTH + DIVIDER_WIDTH) {
        return Math.min(70, Math.max(40, percent));
    }
    // The grid is `${split}% 8px minmax(0, 1fr)`, so the percentage applies to
    // the FULL container width and the 8px divider comes out of the remainder:
    // Scripture is split% of width, commentary is width - split% of width - 8px.
    // Clamping against (width - DIVIDER_WIDTH) instead undershot the commentary
    // minimum by ~5-6px (rendered 294px at max drag instead of 300px).
    const minimum = (MIN_SCRIPTURE_WIDTH / width) * 100;
    const maximum = ((width - MIN_COMMENTARY_WIDTH - DIVIDER_WIDTH) / width) * 100;
    return Math.min(maximum, Math.max(minimum, percent));
}

export function readStudySplit(storage = window.localStorage) {
    const saved = Number(storage.getItem(STUDY_SPLIT_STORAGE_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_STUDY_SPLIT;
}
