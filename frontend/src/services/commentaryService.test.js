import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getChapterCommentaries, getCommentaries } from './commentaryService';

function jsonResponse(data, ok = true) {
    return { ok, json: async () => data };
}

describe('commentaryService', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    test('getCommentaries returns the list on success', async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse([{ id: 3, name: 'Matthew Henry' }])
        );

        await expect(getCommentaries()).resolves.toEqual([
            { id: 3, name: 'Matthew Henry' },
        ]);
    });

    test('getCommentaries rejects when the request fails', async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse({ error: 'Failed to retrieve commentaries.' }, false)
        );

        await expect(getCommentaries()).rejects.toThrow(
            'Unable to load commentaries.'
        );
    });

    test('getCommentaries rejects when the payload is not an array', async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse({ error: 'Failed to retrieve commentaries.' })
        );

        await expect(getCommentaries()).rejects.toThrow(
            'Unable to load commentaries.'
        );
    });

    test('getChapterCommentaries returns entries on success and rejects on failure', async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse([{ id: 1, entry_title: 'Genesis 1' }])
        );

        await expect(getChapterCommentaries(1, 1, 3)).resolves.toEqual([
            { id: 1, entry_title: 'Genesis 1' },
        ]);

        vi.mocked(fetch).mockResolvedValue(
            jsonResponse(
                { error: 'Failed to retrieve chapter commentaries.' },
                false
            )
        );

        await expect(getChapterCommentaries(1, 1, 3)).rejects.toThrow(
            'Unable to load commentary.'
        );
    });
});
