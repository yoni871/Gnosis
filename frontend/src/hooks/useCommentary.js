import { useEffect, useState } from "react";

import useSyncedState from "./useSyncedState";

import {
    getCommentaries,
    getChapterCommentaries
} from "../services/commentaryService";


export default function useCommentary({
    book,
    chapter,
    books,
    urlCommentary
}) {
    const [selectedCommentator, setSelectedCommentator] = useSyncedState(urlCommentary || undefined, urlCommentary || 3);
    const [commentators, setCommentators] = useState([]);
    const [response, setResponse] = useState(null);
    const currentBookId = books.find(item => item.name === book)?.id;
    const location = JSON.stringify([currentBookId, chapter]);
    const requestKey = JSON.stringify([currentBookId, chapter, selectedCommentator]);
    // Keep entries during a commentator switch, but never display another chapter.
    const commentary = response?.location === location ? response.data : [];
    const isLoading = Boolean(currentBookId) && response?.key !== requestKey;
    const commentaryError = response?.key === requestKey ? response.error : "";
    useEffect(() => {
        if (!currentBookId) return;
        let cancelled = false;
        getChapterCommentaries(currentBookId, chapter, selectedCommentator)
            .then(data => {
                if (!cancelled) setResponse({ key: requestKey, location, data, error: "" });
            })
            .catch(() => {
                if (!cancelled) setResponse({ key: requestKey, location, data: [],
                    error: "We couldn’t load this commentary. Please try again." });
            });
        return () => { cancelled = true; };
    }, [currentBookId, chapter, selectedCommentator, requestKey, location]);

    // Load the available commentary sources once.
    useEffect(() => {
        let ignoreResponse = false;

        getCommentaries()
            .then((data) => {
                if (!ignoreResponse) {
                    setCommentators(data);
                }
            })
            .catch((error) => {
                if (!ignoreResponse) {
                    console.error(error);
                }
            });

        return () => {
            ignoreResponse = true;
        };
    }, []);


    return {
        commentary,

        selectedCommentator,
        setSelectedCommentator,

        commentators,

        isLoading,
        commentaryError
    };
}