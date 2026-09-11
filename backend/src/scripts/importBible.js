const XLSX = require("xlsx");
const pool = require("../db/db");

//maps book names from the different translation names to the database name
const bookNameMap = {
    "Psalm": "Psalms"
};

// Read the BSB Excel file
const workbook = XLSX.readFile("src/bsb.xlsx");

// Get the first worksheet
const worksheet = workbook.Sheets[workbook.SheetNames[0]];

// Convert the worksheet into an array of rows
const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1
});

const importBible = async () => {
    try {
        // Load all Bible books from the database once
        const bookResult = await pool.query(
            `
            SELECT id, name
            FROM bible_books
            `
        );

        // Create a map so we can quickly find a book ID by name
        const bookMap = new Map();

        for (const book of bookResult.rows) {
            bookMap.set(book.name, book.id);
        }

        // Keep track of chapters we've already created
        const chapterMap = new Map();

        // Start after the first 3 informational/header rows
        for (let i = 3; i < rows.length; i++) {
            const row = rows[i];

            // Skip empty rows
            if (!row || row.length < 3) {
                continue;
            }

            // Get the verse reference and verse text
            const reference = row[1];
            const text = row[2];

            // Example: "Genesis 1:1"
            const match = reference.match(/^(.+)\s(\d+):(\d+)$/);

            // Skip rows that don't contain a valid Bible reference
            if (!match) {
                continue;
            }

            const bsbBookName = match[1];
            const bookName = bookNameMap[bsbBookName] || bsbBookName;
            const chapterNumber = parseInt(match[2]);
            const verseNumber = parseInt(match[3]);

            // Find the book ID from our map
            const bookId = bookMap.get(bookName);

            if (!bookId) {
                console.log(`Book not found: ${bookName}`);
                continue;
            }

            // Create a unique key for this book/chapter combination
            const chapterKey = `${bookId}-${chapterNumber}`;

            let chapterId = chapterMap.get(chapterKey);

            // Create the chapter if we haven't seen it yet
            if (!chapterId) {
                const chapterResult = await pool.query(
                    `
                    INSERT INTO bible_chapters
                    (book_id, chapter_number)
                    VALUES ($1, $2)
                    RETURNING id
                    `,
                    [bookId, chapterNumber]
                );

                chapterId = chapterResult.rows[0].id;

                // Store the chapter ID so we don't query/create it again
                chapterMap.set(chapterKey, chapterId);
            }

            // Insert the verse
            await pool.query(
                `
                INSERT INTO bible_verses
                (chapter_id, translation_id, verse_number, text)
                VALUES ($1, $2, $3, $4)
                `,
                [chapterId, 1, verseNumber, text]
            );

            // Print progress every 1,000 verses
            if ((i - 2) % 1000 === 0) {
                console.log(`Imported approximately ${i - 2} verses...`);
            }
        }

        console.log("Bible import completed successfully.");

    } catch (error) {
        console.error("Error importing Bible:", error);

    } finally {
        // Close the database connection
        await pool.end();
    }
};

// Run the import
importBible();