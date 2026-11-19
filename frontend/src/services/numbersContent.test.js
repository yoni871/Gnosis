// Numbers in-review category package (integration, not publication).
// Requires the source-registry delta to be safely merged and the one-line
// era patch applied. Dossier 9 (Worship, Vows, and War with Midian) is
// EXCLUDED by QA's Phase 4 FAIL verdict — this package has nine categories,
// narrativeOrder 29–37, and no D9 record anywhere.
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { generateHistoryContent } from '../../scripts/history-content-lib.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HISTORY_CATEGORY_ERAS, HISTORY_CATEGORY_WORD_RANGES, countWords, parseHistoryMarkdown, findFootnoteKeys } from '../utils/historyContent.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../content/history');
const read = (rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));
const manifest = read('books/numbers.json');
const sources = read('sources/references.json');
const ids = manifest.entries.map((entry) => entry.categoryId);
const records = ids.map((id) => read(`categories/${id.slice('category-'.length)}.json`));
const categories = ['numbers-israel-organized-at-sinai', 'numbers-holiness-and-preparation', 'numbers-departure-and-wilderness-complaints', 'numbers-twelve-spies-and-rebellion', 'numbers-korah-and-priesthood', 'numbers-final-wilderness-journey', 'numbers-balaam-and-moab', 'numbers-new-generation-and-joshua', 'numbers-preparing-to-inherit'];
describe('Numbers in-review category package', () => {
  it('contains exactly nine ordered thematic categories (Dossier 9 excluded)', () => {
    expect(ids).toEqual(categories.map((s) => `category-${s}`));
    expect(manifest.entries.map((entry) => entry.narrativeOrder)).toEqual([29, 30, 31, 32, 33, 34, 35, 36, 37]);
    expect(new Set(ids).size).toBe(9);
    expect(ids).not.toContain('category-numbers-worship-vows-midian');
  });
  it('supports a dedicated undated Numbers era without changing earlier eras', () => {
    expect(HISTORY_CATEGORY_ERAS).toEqual(expect.arrayContaining(['primeval','patriarchal','exodus','leviticus','numbers']));
    for (const record of records) {
      expect(record.category).toBe('category');
      expect(record.status).toBe('in-review');
      expect(record.era).toBe('numbers');
      // D3 carries the narrative date in its label + note (Num 10:11 — 20th
      // day, 2nd month, 2nd year; absolute BCE date unknown). There is NO
      // narrative-date type in the schema (HISTORY_DATE_TYPES has no such
      // value, and the validator requires every non-unknown type to carry
      // non-null yearStart/yearEnd — an absolute BCE year range, which
      // would be inventing a date). So type stays "unknown" with null years
      // and the narrative date is recorded in the label + note. Deliberate,
      // not an oversight.
      if (record.id === 'category-numbers-departure-and-wilderness-complaints') {
        expect(record.date.type).toBe('unknown');
        expect(record.date.yearStart).toBeNull();
        expect(record.date.yearEnd).toBeNull();
        expect(record.date.label).toBe('Narrative date: 20th day, 2nd month, 2nd year (Num 10:11)');
        expect(record.date.note).toContain('20th day of the 2nd month of the 2nd year');
        expect(record.date.note).toContain('no absolute year is inferred');
      } else {
        expect(record.date.type).toBe('unknown');
        expect(record.date.yearStart).toBeNull();
        expect(record.date.yearEnd).toBeNull();
      }
      expect(record.review.editorialOverride).toBeUndefined();
      expect(record.relatedEvents).toEqual([]);
      expect(record.primaryScripture.book).toBe('Numbers');
      expect(record.primaryScripture.endChapter - record.primaryScripture.startChapter).toBeLessThanOrEqual(2);
      expect(record.primaryScripture.startChapter).toBeGreaterThanOrEqual(record.fullRange.startChapter);
      expect(record.primaryScripture.endChapter).toBeLessThanOrEqual(record.fullRange.endChapter);
    }
  });
  it('excludes all nine Numbers categories from the published-only generator', () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), 'gnosis-num-gate-'));
    try {
      const bibleChapters = JSON.parse(readFileSync(path.resolve(root, '../../data/bibleChapters.json'), 'utf8'));
      const { manifest: generated } = generateHistoryContent({ contentDir: root, outputDir, bibleChapters, includeUnpublished: false });
      expect(generated.includeUnpublished).toBe(false);
      for (const id of ids) expect(generated.categories).not.toContain(id);
      expect(generated.books).not.toContain('numbers');
      for (const category of categories) expect(existsSync(path.join(outputDir, 'categories', `${category}.json`))).toBe(false);
      expect(existsSync(path.join(outputDir, 'books', 'numbers.json'))).toBe(false);
    } finally { rmSync(outputDir, { recursive: true, force: true }); }
  });
  it('includes all nine Numbers categories in the dev-opt-in generator', () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), 'gnosis-num-dev-'));
    try {
      const bibleChapters = JSON.parse(readFileSync(path.resolve(root, '../../data/bibleChapters.json'), 'utf8'));
      const { manifest: generated } = generateHistoryContent({ contentDir: root, outputDir, bibleChapters, includeUnpublished: true });
      expect(generated.includeUnpublished).toBe(true);
      expect(generated.categories).toEqual(expect.arrayContaining(ids));
      expect(generated.books).toContain('numbers');
      for (const category of categories) expect(existsSync(path.join(outputDir, 'categories', `${category}.json`))).toBe(true);
      expect(existsSync(path.join(outputDir, 'books', 'numbers.json'))).toBe(true);
    } finally { rmSync(outputDir, { recursive: true, force: true }); }
  });
  it('has unique claim and connection IDs and resolves source references and Markdown citations', () => {
    const claimIds = records.flatMap((r) => (r.claims ?? []).map((c) => c.id));
    const connectionIds = records.flatMap((r) => r.connections.map((c) => c.id));
    expect(new Set(claimIds).size).toBe(claimIds.length);
    expect(new Set(connectionIds).size).toBe(connectionIds.length);
    for (const record of records) {
      const slug = record.id.slice('category-'.length);
      const mdPath = path.join(root, 'categories', `${slug}.md`);
      expect(existsSync(mdPath)).toBe(true);
      const md = readFileSync(mdPath, 'utf8');
      const sections = parseHistoryMarkdown(md);
      expect(sections.headings).toEqual(['Overview', 'Ancient World', 'Why This Context Matters']);
      const counts = {overview: countWords(sections.overview), ancientWorld: countWords(sections.ancientWorld), whyItMatters: countWords(sections.whyItMatters)};
      for (const [section, [min, max]] of Object.entries(HISTORY_CATEGORY_WORD_RANGES)) {
        expect(counts[section]).toBeGreaterThanOrEqual(min);
        expect(counts[section]).toBeLessThanOrEqual(max);
      }
      for (const id of [...record.sources, ...findFootnoteKeys(md)]) {
        expect(sources[id], `missing registry source: ${id}`).toBeDefined();
        expect(record.sources).toContain(id);
      }
    }
  });
  it('preserves all 27 claims and 35 connections without editorial overrides', () => {
    expect(records.flatMap((r) => r.claims ?? [])).toHaveLength(27);
    expect(records.flatMap((r) => r.connections ?? [])).toHaveLength(35);
    for (const r of records) {
      expect(r.review.editorialOverride).toBeUndefined();
      expect(r.status).toBe('in-review');
    }
  });
  it('records the Numbers 10 boundary explicitly (10:10/10:11 split, not a shared chapter)', () => {
    const d2 = records.find((r) => r.id === 'category-numbers-holiness-and-preparation');
    const d3 = records.find((r) => r.id === 'category-numbers-departure-and-wilderness-complaints');
    expect(d2.fullRange.endChapter).toBe(10);
    expect(d2.fullRange.endVerse).toBe(10);
    expect(d3.fullRange.startChapter).toBe(10);
    expect(d3.fullRange.startVerse).toBe(11);
    expect(d3.primaryScripture.startChapter).toBe(10);
    expect(d3.primaryScripture.startVerse).toBe(11);
  });
});
