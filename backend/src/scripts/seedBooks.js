const pool = require("../db/db");
const books = require("../data/bible_books.json");

//insert the 66 bible books into the database
const seedBooks = async () => {
    try {

        // Insert each book from the JSON file
        for (const book of books) {

            await pool.query(
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

        console.log("Successfully inserted all Bible books.");

    } catch (error) {

        // Print any database errors
        console.error("Error inserting Bible books:", error);

    } finally {

        // Close the database connection
        await pool.end();
    }
};

// Run the seed function
seedBooks();