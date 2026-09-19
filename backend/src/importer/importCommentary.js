const fs = require("fs");
const path = require("path");
const pool = require("../db/db");


const importCommentary = async (datasetFolder, commentaryId) => {
    try {
        // Path to the directory containing the JSON files
        const dataDirectory = path.join(
            __dirname,
            `../../../${datasetFolder}`
        );

        // Get all files in the directory
        const files = fs.readdirSync(dataDirectory);

        // Keep only JSON files that may contain commentary data
        const excludedFiles = new Set([
            "introductory_material.json",
            "metadata.json",
            "validation_report.json",
            "source-import-validation.json",
            "restructuring-validation.json"
        ]);

        const jsonFiles = files.filter(
            file => file.endsWith(".json") && !excludedFiles.has(file)
        );

        const commentaryResult = await pool.query(
            `
            SELECT id, title
            FROM commentaries
            WHERE id = $1
            `,
            [commentaryId]
        );

        if(commentaryResult.rows.length === 0) {
            console.error(`Commentary ID ${commentaryId} not found.`)
            return;
        }

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

            if(!data.book || !Array.isArray(data.entries)) {
                console.log(`We are skippiing this non commentary file`);
                continue;
            }

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
                        commentaryId,          // commentary ID
                        bookId,               // Current Bible book ID
                        entry.start_chapter,
                        entry.start_verse,
                        entry.end_chapter,
                        entry.end_verse,
                        entry.content,
                        entry.title
                    ]
                )
            }
            console.log(`${data.book} imported successfully.`);
            // console.log(data.book, bookId);
        }
    } catch (error) {
        console.error(`Error importing ${datasetFolder}:`, error);
    } finally {
        await pool.end();
    }
}

importCommentary("jfb-restructured", 4);