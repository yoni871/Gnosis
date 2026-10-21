import { useEffect, useRef, useState } from "react";
import { getBibleChapter } from "../services/bibleService";

export default function useScripturePreviews(bookmarks, books, translation, highlights) {
    // Store chapter verses so bookmarks in the same chapter share the data.
    const [chapters, setChapters] = useState({});

    // Track preview loading separately from loading the bookmark records.
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    // Keep chapter requests across renders without triggering a render.
    const cacheRef = useRef(new Map());

    useEffect(() => {
        // Wait until a translation and the book records are available.
        if (!translation || books.length === 0) {
            return;
        }

        // Store each required chapter once, even if multiple bookmarks use it.
        const needed = new Map();

        for (const bookmark of bookmarks) {
            const book = books.find((item) => item.id === bookmark.book_id);

            // Skip a bookmark if its book record cannot be found.
            if (!book) {
                continue;
            }

            // Include every chapter covered by the bookmarked passage.
            for (
                let chapter = bookmark.start_chapter;
                chapter <= bookmark.end_chapter;
                chapter += 1
            ) {
                const key = `${book.id}:${chapter}`;

                needed.set(key, {
                    book: book.name,
                    chapter
                });
            }
        }

    // Include highlighted chapters in the same collection of required chapters.
    for (const highlight of highlights ?? []) {
        const book = books.find(
            (item) => item.id === highlight.book_id
        );

        // Wait for a matching book record before requesting Scripture.
        if (!book) {
            continue;
        }

        // Reuse the bookmark key format to avoid duplicate chapter requests.
        const key = `${book.id}:${highlight.chapter}`;

        needed.set(key, {
            book: book.name,
            chapter: highlight.chapter
        });
    }

    // Ignore responses if bookmarks or translation change during loading.
    let ignore = false;

    async function loadPreviews() {
        setIsLoading(true);
        setError("");
        setChapters({});

        try {
            // Fetch each unique chapter and keep its key beside its verses.
            const results = await Promise.all(
                [...needed.entries()].map(async ([key, passage]) => {
                    // Separate cached chapters by translation.
                    const cacheKey = `${translation}:${key}`;

                    // Look for a request we already started.
                    let request = cacheRef.current.get(cacheKey);

                    if (!request) {
                        // Fetch only when this chapter has no cached request.
                        request = getBibleChapter(
                            passage.book,
                            passage.chapter,
                            translation
                        )
                            .then((verses) => {
                                if (!Array.isArray(verses)) {
                                    throw new Error("Unable to load Scripture previews.");
                                }

                                return verses;
                            })
                            .catch((error) => {
                                // Allow another attempt after a failed request.
                                cacheRef.current.delete(cacheKey);
                                throw error;
                            });

                        // Store the promise immediately so other loads can share it.
                        cacheRef.current.set(cacheKey, request);
                    }

                    // Await the existing request or the one we just created.
                    const verses = await request;

                    return [key, verses];
                })
            );

            // Convert the chapter pairs into an object for easy lookup.
            if (!ignore) {
                setChapters(Object.fromEntries(results));
            }
        } catch (error) {
            if (!ignore) {
                setError(error.message);
            }
        } finally {
            if (!ignore) {
                setIsLoading(false);
            }
        }
    }

    loadPreviews();

    // React calls this when dependencies change or the hook unmounts.
    return () => {
        ignore = true;
    };
    }, [bookmarks, highlights, books, translation]);
    // Expose the preview data and status to the panel.
    return {
        chapters,
        isLoading,
        error
    };
}