// Proposed Vitest regression checks for the Leviticus Phase 2 content package.
// Requires the source-registry delta to be safely merged and the one-line era patch applied.
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { generateHistoryContent } from '../../scripts/history-content-lib.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HISTORY_CATEGORY_ERAS, HISTORY_CATEGORY_WORD_RANGES, countWords, parseHistoryMarkdown, findFootnoteKeys } from '../utils/historyContent.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../content/history');
const read = (rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));
const manifest = read('books/leviticus.json');
const sources = read('sources/references.json');
const ids = manifest.entries.map((entry) => entry.categoryId);
const records = ids.map((id) => read(`categories/${id.slice('category-'.length)}.json`));
const categories = ['leviticus-sacrificial-system', 'leviticus-priesthood-consecration', 'leviticus-purity-restoration', 'leviticus-day-of-atonement', 'leviticus-holiness-code', 'leviticus-festivals-worship', 'leviticus-jubilee-covenant'];
describe('Leviticus published category package', () => {
  it('contains exactly seven ordered thematic categories', () => {
    expect(ids).toEqual(categories.map((s) => `category-${s}`));
    expect(manifest.entries.map((entry) => entry.narrativeOrder)).toEqual([22, 23, 24, 25, 26, 27, 28]);
    expect(new Set(ids).size).toBe(7);
  });
  it('supports a dedicated undated Leviticus era without changing earlier eras', () => {
    expect(HISTORY_CATEGORY_ERAS).toEqual(expect.arrayContaining(['primeval','patriarchal','exodus','leviticus']));
    for (const record of records) {
      expect(record.category).toBe('category');
      expect(record.status).toBe('published');
      expect(record.era).toBe('leviticus');
      expect(record.date.type).toBe('unknown');
      expect(record.date.yearStart).toBeNull();
      expect(record.date.yearEnd).toBeNull();
      expect(record.review.editorialOverride).toBeUndefined();
      expect(record.relatedEvents).toEqual([]);
      expect(record.primaryScripture.book).toBe('Leviticus');
      expect(record.primaryScripture.endChapter - record.primaryScripture.startChapter).toBeLessThanOrEqual(2);
      expect(record.primaryScripture.startChapter).toBeGreaterThanOrEqual(record.fullRange.startChapter);
      expect(record.primaryScripture.endChapter).toBeLessThanOrEqual(record.fullRange.endChapter);
    }
  });
  it('includes all Leviticus published content in the published-only generator', () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), 'gnosis-lev-gate-'));
    try {
      const bibleChapters = JSON.parse(readFileSync(path.resolve(root, '../../data/bibleChapters.json'), 'utf8'));
      const { manifest } = generateHistoryContent({ contentDir: root, outputDir, bibleChapters, includeUnpublished: false });
      expect(manifest.includeUnpublished).toBe(false);
      expect(manifest.categories).toEqual(expect.arrayContaining(ids));
      expect(manifest.books).toContain('leviticus');
      for (const category of categories) expect(existsSync(path.join(outputDir, 'categories', `${category}.json`))).toBe(true);
      expect(existsSync(path.join(outputDir, 'books', 'leviticus.json'))).toBe(true);
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
  it('preserves all 53 original claims and 56 connections without editorial overrides', () => {
    expect(records.flatMap((r) => r.claims ?? [])).toHaveLength(53);
    expect(records.flatMap((r) => r.connections ?? [])).toHaveLength(56);
    for (const r of records) {
      expect(r.review.editorialOverride).toBeUndefined();
      expect(r.status).toBe('published');
    }
  });
  it('requires source clearance without treating source clearance as permission to publish', () => {
    for (const r of records) {
      const unverified = r.sources.filter((sourceId) => sources[sourceId]?.verification !== 'verified');
      expect(unverified).toEqual([]); // Only the strict source check; publication was a separate editorial decision.
      expect(r.sources).not.toContain('source-sefaria-leviticus');
      expect(r.sources).toContain('source-kjv-leviticus-biblehub');
      expect(r.status).toBe('published');
      expect(r.review.editorialOverride).toBeUndefined();
    }
  });

});
