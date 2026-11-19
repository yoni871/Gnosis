// Numbers published source clearance (publication).
// The two NIV sources below are asserted AS not-independently-verified —
// that documents a known limitation, not a hidden blocker. Yonatan DECIDED
// Leave-as-is (2026-11-19): the KJV stored-text errors (Num 14:17, 31:28)
// will not be fixed and Ketef Hinnom stays NIV; publication proceeds with
// that known limitation. This test does not grant an editorialOverride.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const content = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../content/history');
const read = (rel) => JSON.parse(readFileSync(path.join(content, rel), 'utf8'));

const DELTA = {
  'source-numbers-kjv-biblehub': 'not-independently-verified',
  'source-adair-numbers-census': 'verified',
  'source-macdonald-east-jordan': 'verified',
  'source-frevel-numbers-27-36': 'verified',
  'source-deir-alla-livius': 'verified',
  'source-ketef-hinnom-barkay': 'not-independently-verified',
};

describe('Numbers published sources satisfy the publication source check', () => {
  it('carries nine published records with no editorial override and every cited source present', () => {
    const sources = read('sources/references.json');
    const book = read('books/numbers.json');
    expect(book.entries).toHaveLength(9);
    expect(Object.keys(sources)).toHaveLength(180);
    for (const {categoryId} of book.entries) {
      expect(categoryId).not.toBe('category-numbers-worship-vows-midian');
      const record = read(`categories/${categoryId.slice('category-'.length)}.json`);
      expect(record.status).toBe('published');
      expect(record.review?.editorialOverride).toBeUndefined();
      for (const id of record.sources) {
        expect(sources[id], `missing ${id}`).toBeDefined();
      }
    }
  });
  it('merges exactly six delta sources with the expected verification flags', () => {
    const sources = read('sources/references.json');
    for (const [id, verification] of Object.entries(DELTA)) {
      expect(sources[id], `missing delta source: ${id}`).toBeDefined();
      expect(sources[id]?.verification, `${id} verification`).toBe(verification);
    }
  });
  it('flags the two remaining not-independently-verified delta sources as NIV (known limitation, Yonatan Leave-as-is — not a publication blocker)', () => {
    const sources = read('sources/references.json');
    // Frevel is verified after the QA §4.6 metadata correction; the KJV
    // (cited by all nine categories) and Ketef Hinnom stay NIV at this scope.
    expect(sources['source-numbers-kjv-biblehub']?.verification).toBe('not-independently-verified');
    expect(sources['source-ketef-hinnom-barkay']?.verification).toBe('not-independently-verified');
    expect(sources['source-frevel-numbers-27-36']?.verification).toBe('verified');
  });
  it('carries the corrected Frevel metadata (2013 Mohr Siebeck chapter, §2.7 pp. 24–30)', () => {
    const sources = read('sources/references.json');
    const frevel = sources['source-frevel-numbers-27-36'];
    expect(frevel).toBeDefined();
    expect(frevel.title).toBe('The Book of Numbers – Formation, Composition, and Interpretation of a Late Part of the Torah');
    expect(frevel.publisher).toContain('Mohr Siebeck');
    expect(frevel.publisher).toContain('2013');
    expect(frevel.year).toBe(2013);
    expect(frevel.pagesOrSection).toContain('§2.7');
    expect(frevel.pagesOrSection).toContain('24–30');
    expect(frevel.verification).toBe('verified');
  });
});
