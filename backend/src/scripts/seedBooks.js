const { biblePool, commentaryPool } = require("../db/db");
const books = require("../data/bible_books.json");

//insert the 66 bible books into the database
const seedBooks = async () => {
    try {

        // Insert each book from the JSON file into the Bible project,
        // then into the Commentary project's read-only copy, so the two
        // stay identical. In a single-database deployment both pools are
        // the same instance, so seed once.
        const targets = commentaryPool === biblePool
            ? [biblePool]
            : [biblePool, commentaryPool];
        for (const target of targets) {
            for (const book of books) {

                await target.query(
                    `
                    INSERT INTO bible_books
                    (name, abbreviation, testament, book_order)
                    VALUES ($1, $2, $3, $4)
                    `,
                    [
                        book.name,
                        book.abbreviation,
                        book.testament,
                        book.book_order
                    ]
                );
            }
        }

        console.log("Successfully inserted all Bible books.");

    } catch (error) {

        // Print any database errors
        console.error("Error inserting Bible books:", error);

    } finally {

        // Close the database connections
        await biblePool.end();
        if (commentaryPool !== biblePool) await commentaryPool.end();
    }
};

// Run the seed function
seedBooks();
