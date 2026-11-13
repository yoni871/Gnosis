import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getBibleChapter } from "../../services/bibleService";

export default function ScripturePreviewSheet({ reference, translation, onClose, onOpen }) {
    const [verses, setVerses] = useState([]);
    useEffect(() => {
        let active = true;
        if (reference) Promise.all(
            Array.from({ length: reference.endChapter - reference.startChapter + 1 }, (_, index) => reference.startChapter + index)
                .map((chapter) => getBibleChapter(reference.book, chapter, translation).then((rows) => rows
                    .filter((row) => chapter !== reference.startChapter || row.verse_number >= reference.startVerse)
                    .filter((row) => chapter !== reference.endChapter || row.verse_number <= reference.endVerse)
                    .map((row) => ({ ...row, chapter })))))
            .then((chapters) => active && setVerses(chapters.flat()))
            .catch(() => active && setVerses([]));
        return () => { active = false; };
    }, [reference, translation]);
    if (!reference) return null;
    return <div className="fixed inset-0 z-[80] bg-black/35" onClick={onClose}>
        <section aria-modal="true" role="dialog" aria-label={reference.text} onClick={(event) => event.stopPropagation()}
            className="absolute inset-x-0 bottom-0 max-h-[70vh] rounded-t-3xl bg-[var(--bg-panel)] px-6 pb-8 pt-4 shadow-2xl">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--border)]" />
            <div className="flex items-center justify-between"><h2 className="font-serif text-xl font-semibold text-[var(--color-brand)]">{reference.text}</h2><button type="button" onClick={onClose} aria-label="Close Scripture"><X size={20} /></button></div>
            <div className="mt-5 max-h-[42vh] overflow-y-auto font-serif leading-8 text-[var(--text-primary)]">
                {verses.length ? verses.map((verse) => <p key={`${verse.chapter}:${verse.verse_number}`}><sup className="mr-2 text-[var(--color-accent-text)]">{verse.chapter !== reference.startChapter ? `${verse.chapter}:` : ""}{verse.verse_number}</sup>{verse.text}</p>) : <p className="text-[var(--text-muted)]">Loading passage…</p>}
            </div>
            <button type="button" onClick={() => onOpen(reference)} className="mt-5 w-full rounded-full bg-[var(--color-brand)] px-4 py-3 text-sm font-semibold text-white">Open in Scripture</button>
        </section>
    </div>;
}
