// Proposed read-only publication-source safety test. Never change record statuses.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const content = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../content/history');
const read = (rel) => JSON.parse(readFileSync(path.join(content, rel), 'utf8'));

describe('Leviticus proposed sources satisfy existing publication-source check', () => {
  it('does not require an unauthorized editorial override on any of seven in-review records', () => {
    const sources = read('sources/references.json');
    const book = read('books/leviticus.json');
    expect(book.entries).toHaveLength(7);
    for (const {categoryId} of book.entries) {
      const record = read(`categories/${categoryId.slice('category-'.length)}.json`);
      expect(record.status).toBe('in-review');
      expect(record.review?.editorialOverride).toBeUndefined();
      for (const id of record.sources) {
        expect(sources[id], `missing ${id}`).toBeDefined();
        expect(sources[id]?.verification, `${id} has not been verified`).toBe('verified');
      }
    }
  });
});
