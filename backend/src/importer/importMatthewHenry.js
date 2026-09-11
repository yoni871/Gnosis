const fs = require("fs");
const path = require("path");
const pool = require("../db/db");

// Path to the directory containing the Matthew Henry JSON files
const dataDirectory = path.join(
    __dirname,
    "../../../matthew-henry-json"
);

// Get all files in the directory
const files = fs.readdirSync(dataDirectory);

// Keep only the 66 Bible book JSON files
const excludedFiles = new Set([
    "introductory_material.json",
    "metadata.json",
    "validation_report.json"
]);

const jsonFiles = files.filter(
    file => file.endsWith(".json") && !excludedFiles.has(file)
);

const importMatthewHenry = async () => {
    try {
        const bookResult = await pool.query(
            `
            SELECT id, name
            FROM bible_books
            `
        );
        const bookMap = new Map();
        for(const book of bookResult.rows) {
            bookMap.set(book.name, book.id);
        }

        for(const file of jsonFiles) {
            const filePath = path.join(dataDirectory, file);
            const data = JSON.parse(
                fs.readFileSync(filePath, "utf8") //gives the raw text
            );
            const bookId = bookMap.get(data.book);
            if(!bookId) {
                console.log(`Book not found: ${data.book}`);
                continue;
            }
            for(const entry of data.entries) {
                await pool.query(
                    `
                    INSERT INTO commentary_entries 
                    (
                        commentary_id,
                        book_id,
                        start_chapter,
                        start_verse,
                        end_chapter,
                        end_verse,
                        content,
                        title
                    )
                    VALUES($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (
                        commentary_id,
                        book_id,
                        start_chapter,
                        start_verse,
                        end_chapter,
                        end_verse
                    ) DO NOTHING
                    `,
                    [
                        3,                    // Matthew Henry commentary ID
                        bookId,               // Current Bible book ID
                        entry.start_chapter,
                        entry.start_verse,
                        entry.end_chapter,
                        entry.end_verse,
                        entry.content,
                        entry.title
                    ]
                )
                console.log(`${data.book} imported successfully.`);
            }
            console.log(`${data.book} imported successfully.`);
            // console.log(data.book, bookId);
        }
    } catch (error) {
        console.error("Error importing Matthew Henry:", error);
    } finally {
        await pool.end();
    }
}

importMatthewHenry();