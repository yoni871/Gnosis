import { useEffect, useState } from "react";

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
    const [commentary, setCommentary] = useState([]);

    const [selectedCommentator, setSelectedCommentator] = useState(
        urlCommentary || 3
    );

    const [commentators, setCommentators] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [commentaryError, setCommentaryError] = useState("");

    const currentBook = books.find(
        (item) => item.name === book
    );

    const currentBookId = currentBook?.id;


    // Update the selected commentary when it is provided by the URL.
    useEffect(() => {
        if (urlCommentary) {
            setSelectedCommentator(urlCommentary);
        }
    }, [urlCommentary]);


    // Load commentary for the selected book, chapter, and commentator.
    useEffect(() => {
        if (!currentBookId) {
            return;
        }

        let ignoreResponse = false;

        setCommentary([]);
        setIsLoading(true);
        setCommentaryError("");

        getChapterCommentaries(
            currentBookId,
            chapter,
            selectedCommentator
        )
            .then((data) => {
                if (!ignoreResponse) {
                    setCommentary(data);
                }
            })
            .catch((error) => {
                if (!ignoreResponse) {
                    console.error(error);
                    setCommentary([]);

                    setCommentaryError(
                        "We couldn’t load this commentary. Please try again."
                    );
                }
            })
            .finally(() => {
                if (!ignoreResponse) {
                    setIsLoading(false);
                }
            });

        return () => {
            ignoreResponse = true;
        };
    }, [
        currentBookId,
        chapter,
        selectedCommentator
    ]);


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