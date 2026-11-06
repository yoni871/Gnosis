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
