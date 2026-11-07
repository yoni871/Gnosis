import { it, expect, vi } from 'vitest';
import { searchBible, searchCommentary } from './searchService';
it('caches public results by translation and expires them', async () => {
    vi.useFakeTimers();
    fetch.mockResolvedValue({ ok: true, json: async () => [{ text: 'Faith' }] });
    await searchBible('faith-cache');
    await searchBible('faith-cache');
    expect(fetch).toHaveBeenCalledTimes(1);
    await searchBible('faith-cache', 'KJV');
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_001);
    await searchBible('faith-cache');
    expect(fetch).toHaveBeenCalledTimes(3);
});
it('passes cancellation through and never caches failures', async () => {
    const controller = new AbortController();
    fetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
    await expect(searchCommentary('cancelled-query', { signal: controller.signal })).rejects.toThrow('Aborted');
    expect(fetch.mock.calls[0][1].signal).toBe(controller.signal);
    fetch.mockResolvedValue({ ok: true, json: async () => [] });
    await searchCommentary('cancelled-query');
    expect(fetch).toHaveBeenCalledTimes(2);
});
it('pages Bible search and returns the total and hasMore', async () => {
    const pageOne = { results: [{ text: 'Lord, hear' }], total: 250, page: 1, limit: 100, hasMore: true };
    const pageTwo = { results: [{ text: 'The Lord is' }], total: 250, page: 2, limit: 100, hasMore: true };
    fetch.mockResolvedValueOnce({ ok: true, json: async () => pageOne });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => pageTwo });
    await expect(searchBible('lord')).resolves.toEqual(pageOne);
    expect(fetch.mock.calls[0][0]).toContain('page=1');
    await expect(searchBible('lord', 'BSB', { page: 2 })).resolves.toEqual(pageTwo);
    expect(fetch.mock.calls[1][0]).toContain('page=2');
    // Each page is cached under its own URL, so re-reading page 1 costs no fetch.
    await expect(searchBible('lord')).resolves.toEqual(pageOne);
    expect(fetch).toHaveBeenCalledTimes(2);
});
