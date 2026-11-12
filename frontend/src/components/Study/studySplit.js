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
    const available = width - DIVIDER_WIDTH;
    const minimum = (MIN_SCRIPTURE_WIDTH / available) * 100;
    const maximum = 100 - (MIN_COMMENTARY_WIDTH / available) * 100;
    return Math.min(maximum, Math.max(minimum, percent));
}

export function readStudySplit(storage = window.localStorage) {
    const saved = Number(storage.getItem(STUDY_SPLIT_STORAGE_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_STUDY_SPLIT;
}
