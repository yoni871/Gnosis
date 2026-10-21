const { saveHighlights, 
    getHighlights: loadHighlights,
    deleteHighlight: removeHighlight,
    deleteHighlightsInPassage: clearPassageHighlights
} = require("../services/highlightsService");
const { isValidColor, isValidVerseSelection } = require("../utils/highlightValidation");

// Handle a request to apply a color to a passage.
const createHighlight = async (req, res) => {
    // Use the identity verified by JWT middleware, not a user ID from the body.
    const userId = req.user.userId;

    // Read the exact selected verses rather than a continuous range.
    const {
        bookId,
        verses,
        color = "#FFD54F"
    } = req.body;

    // Require a positive integer book ID.
    if (!Number.isInteger(bookId) || bookId <= 0) {
        return res.status(400).json({
            error: "A valid book ID is required."
        });
    }

    // Require a nonempty list of valid chapter/verse coordinates.
    if (!isValidVerseSelection(verses)) {
        return res.status(400).json({
            error: "Select at least one valid verse."
        });
    }

    // Accept only six-digit RGB hex colors.
    if (!isValidColor(color)) {
        return res.status(400).json({
            error: "Color must be a six-digit hex value, such as #FFD54F."
        });
    }

    try {
        // Let the service verify and save only the submitted coordinates.
        const highlights = await saveHighlights(userId, bookId, verses, color);

        //can create records or recolor existing ones.
        return res.status(200).json(highlights);
    } catch (error) {
        if(error.code === "INVALID_PASSAGE") {
            return res.status(400).json({
                error: error.message
            });
        }
        console.error(error);
        
        return res.status(500).json({
            error: "Failed to save highlights."
        })
    }
};

// Respond with the authenticated user's saved highlights.
const getHighlights = async (req, res) => {
    const userId = req.user.userId;

    try {
        // Ask the service for records belonging to this user.
        const highlights = await loadHighlights(userId);

        return res.status(200).json(highlights);
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Failed to load highlights."
        });
    }
};

// Handle removal of one saved verse highlight.
const deleteHighlight = async (req, res) => {
    const userId = req.user.userId;

    // Route parameters arrive as strings; convert the ID to a number.
    const highlightId = Number(req.params.id);

    // Reject IDs that cannot represent a positive integer record ID.
    if (!Number.isInteger(highlightId) || highlightId <= 0) {
        return res.status(400).json({
            error: "A valid highlight ID is required."
        });
    }

    try {
        // The service includes ownership in the DELETE query.
        const highlight = await removeHighlight(userId, highlightId);

        if (!highlight) {
            return res.status(404).json({
                error: "Highlight not found."
            });
        }

        return res.status(200).json({
            message: "Highlight removed.",
            id: highlight.id
        });
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Failed to remove highlight."
        });
    }
};

// Clear highlights only within the authenticated user's selected passage.
const deleteHighlightsInPassage = async (req, res) => {
    const userId = req.user.userId;

    // Read only the coordinates the user wants to clear.
    const { bookId, verses } = req.body;

    // Reject invalid book IDs before running SQL.
    if (!Number.isInteger(bookId) || bookId <= 0) {
        return res.status(400).json({
            error: "A valid book ID is required."
        });
    }

    // Require a nonempty collection of valid verse coordinates.
    if (!isValidVerseSelection(verses)) {
        return res.status(400).json({
            error: "Select at least one valid verse."
        });
    }

    try {
        // Delete matching selected verses, leaving unselected verses untouched.
        const removed = await clearPassageHighlights(userId, bookId, verses);

        // Return IDs so the frontend can remove these records from its state.
        return res.status(200).json({
            removedIds: removed.map((highlight) => highlight.id)
        });
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Failed to clear highlights."
        });
    }
};

module.exports = {
    createHighlight,
    getHighlights,
    deleteHighlight,
    deleteHighlightsInPassage
};