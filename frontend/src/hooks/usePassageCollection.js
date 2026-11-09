import { useEffect } from 'react';
import { appendCollection, privatePage } from '../utils/privatePages';

// Load only the current chapter, with bounded sequential pages. A global journal
// page must not determine whether an older highlight/bookmark exists here.
export default function usePassageCollection({ bookId, chapter, token, owner, isAuthenticated,
    isAuthLoading, capture, isCurrent, fetchPage, setItems, setLoading, setError, maxPages }) {
    useEffect(() => {
        if (!bookId || !chapter || !token || !isAuthenticated || isAuthLoading) return;
        const ticket = capture();
        let active = true;
        async function load() {
            setLoading(true);
            try {
                let cursor = null;
                const items = [];
                for (let i = 0; i < maxPages; i++) {
                    const page = privatePage(await fetchPage(token, cursor, { bookId, chapter }));
                    if (!active || !isCurrent(ticket)) return;
                    items.push(...page.items);
                    if (!page.nextCursor) { setItems(current => appendCollection(current, items)); return; }
                    if (cursor && Number(page.nextCursor) >= Number(cursor)) throw new Error('Invalid saved-data cursor.');
                    cursor = page.nextCursor;
                }
                throw new Error('This passage contains too many saved items to load.');
            } catch (error) { if (active && isCurrent(ticket)) setError(error.message); }
            finally { if (active && isCurrent(ticket)) setLoading(false); }
        }
        load();
        return () => { active = false; };
    }, [bookId, chapter, token, owner, isAuthenticated, isAuthLoading, capture, isCurrent,
        fetchPage, setItems, setLoading, setError, maxPages]);
}
