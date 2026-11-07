const path = require('node:path');
const fs = require('node:fs');
const {root,translations,commentaryKeys,hashFiles,commentaryFiles,readCollection} = require('./catalog');
async function transaction(db,work) {
    await db.query('BEGIN');
    try {const result=await work();await db.query('COMMIT');return result;}
    catch(error){await db.query('ROLLBACK');throw error;}
}
async function ledger(db,key,hash,count) {
    await db.query(`INSERT INTO gnosis_local_dev.imports(key,hash,row_count) VALUES($1,$2,$3)
        ON CONFLICT(key) DO UPDATE SET hash=EXCLUDED.hash,row_count=EXCLUDED.row_count,updated_at=now()`,[key,hash,count]);
}
async function current(db,key,hash,countQuery,params=[]) {
    const row=(await db.query('SELECT hash,row_count FROM gnosis_local_dev.imports WHERE key=$1',[key])).rows[0];
    if (!row || row.hash!==hash) return false;
    const count=Number((await db.query(countQuery,params)).rows[0].count);
    return count===row.row_count;
}
async function batches(records,write) {
    for(let i=0;i<records.length;i+=1000) await write(JSON.stringify(records.slice(i,i+1000)));
}
async function importContent(db) {
    // Auxiliary local bookkeeping is outside public: migration drift checks stay authoritative.
    await db.query(`CREATE SCHEMA IF NOT EXISTS gnosis_local_dev;
        REVOKE ALL ON SCHEMA gnosis_local_dev FROM PUBLIC;
        CREATE TABLE IF NOT EXISTS gnosis_local_dev.imports
        (key text PRIMARY KEY,hash text NOT NULL,row_count integer NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())`);
    const books=require('../../src/data/bible_books.json');
    for(const b of books) await db.query(`INSERT INTO bible_books(name,abbreviation,testament,book_order)
        SELECT $1::varchar,$2::varchar,$3::varchar,$4::integer WHERE NOT EXISTS(SELECT 1 FROM bible_books WHERE name=$1)`,
        [b.name,b.abbreviation,b.testament,b.book_order]);
    const bookMap=new Map((await db.query('SELECT id,name FROM bible_books')).rows.map(b=>[b.name,b.id]));
    for(const t of translations) {
        await db.query(`INSERT INTO bible_translations(name,abbreviation) SELECT $1::varchar,$2::varchar
            WHERE NOT EXISTS(SELECT 1 FROM bible_translations WHERE abbreviation=$2)`,[t.name,t.abbreviation]);
        const row=(await db.query('SELECT id FROM bible_translations WHERE abbreviation=$1',[t.abbreviation])).rows[0];
        const key=`bible:${t.abbreviation}`,file=path.join(root,t.file),hash=hashFiles([file,__filename]);
        if(await current(db,key,hash,'SELECT count(*) FROM bible_verses WHERE translation_id=$1',[row.id])) {
            console.log(`${t.abbreviation}: unchanged`);continue;
        }
        const {parseWorkbook}=require('../../../tools/bible-import/src/parseWorkbook');
        const parsed=parseWorkbook(file);
        const records=parsed.records.map(r=>({...r,book_id:bookMap.get(r.book)}));
        if(!records.length || records.some(r=>!r.book_id)) throw new Error(`Invalid book mapping for ${t.abbreviation}`);
        await transaction(db,async()=>{
            await batches(records,json=>db.query(`INSERT INTO bible_chapters(book_id,chapter_number)
                SELECT DISTINCT book_id,chapter FROM jsonb_to_recordset($1::jsonb) AS r(book_id integer,chapter integer)
                ON CONFLICT(book_id,chapter_number) DO NOTHING`,[json]));
            await batches(records,json=>db.query(`INSERT INTO bible_verses(chapter_id,translation_id,verse_number,text)
                SELECT c.id,$2,r.verse,r.text FROM jsonb_to_recordset($1::jsonb)
                AS r(book_id integer,chapter integer,verse integer,text text)
                JOIN bible_chapters c ON c.book_id=r.book_id AND c.chapter_number=r.chapter
                ON CONFLICT(chapter_id,translation_id,verse_number) DO UPDATE SET text=EXCLUDED.text
                WHERE bible_verses.text IS DISTINCT FROM EXCLUDED.text`,[json,row.id]));
            const count=Number((await db.query('SELECT count(*) FROM bible_verses WHERE translation_id=$1',[row.id])).rows[0].count);
            await ledger(db,key,hash,count);
        });
        console.log(`${t.abbreviation}: ${records.length} source verses synchronized`);
    }
    for(const key of commentaryKeys) {
        const files=commentaryFiles(key),hash=hashFiles([...files,__filename,path.join(__dirname,'catalog.js')]);
        const datasetKey=`commentary:${key}`;
        const data=readCollection(key);
        if(data.records.some(r=>!bookMap.has(r.book))) throw new Error(`Unknown book in ${key}`);
        let commentary=(await db.query('SELECT id,source_id FROM commentaries WHERE title=$1 ORDER BY id LIMIT 1',[data.title])).rows[0];
        if(!commentary) {
            const source=(await db.query(`INSERT INTO sources(name,type,description,license)
                VALUES($1,'commentary',$2,$3) RETURNING id`,[data.author,data.attribution,data.license])).rows[0];
            commentary=(await db.query('INSERT INTO commentaries(source_id,title,description) VALUES($1,$2,$3) RETURNING id,source_id',
                [source.id,data.title,data.attribution])).rows[0];
        }
        await db.query('UPDATE sources SET description=$1,license=$2 WHERE id=$3',[data.attribution,data.license,commentary.source_id]);
        if(await current(db,datasetKey,hash,'SELECT count(*) FROM commentary_entries WHERE commentary_id=$1',[commentary.id])) {
            console.log(`${key}: unchanged`);continue;
        }
        const records=data.records.map(r=>({...r,book_id:bookMap.get(r.book)}));
        await transaction(db,async()=>{
            await batches(records,json=>db.query(`INSERT INTO commentary_entries
                (commentary_id,book_id,start_chapter,start_verse,end_chapter,end_verse,content,title)
                SELECT $2,r.book_id,r.start_chapter,r.start_verse,r.end_chapter,r.end_verse,r.content,r.title
                FROM jsonb_to_recordset($1::jsonb) AS r(book_id integer,start_chapter integer,start_verse integer,
                    end_chapter integer,end_verse integer,content text,title text)
                ON CONFLICT(commentary_id,book_id,start_chapter,start_verse,end_chapter,end_verse)
                DO UPDATE SET content=EXCLUDED.content,title=EXCLUDED.title
                WHERE (commentary_entries.content,commentary_entries.title) IS DISTINCT FROM (EXCLUDED.content,EXCLUDED.title)`,[json,commentary.id]));
            const count=Number((await db.query('SELECT count(*) FROM commentary_entries WHERE commentary_id=$1',[commentary.id])).rows[0].count);
            await ledger(db,datasetKey,hash,count);
        });
        console.log(`${key}: ${records.length} unique source entries synchronized`);
    }
    for(const folder of fs.readdirSync(root).filter(f=>f.endsWith('-restructured'))) {
        if(!commentaryKeys.includes(folder.replace(/-restructured$/,''))) {
            throw new Error(`Unreviewed collection ${folder}: add license metadata to local/catalog.js first.`);
        }
    }
}
module.exports={importContent,transaction,ledger,current};
