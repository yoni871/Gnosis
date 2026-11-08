// Read-only application code; only a disposable, explicitly provisioned local cluster is used.
const { Client } = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const http = require('node:http');
async function main() {
    const client = new Client({ host: '127.0.0.1', port: 55439, user: 'gnosis_test',
        database: 'postgres', ssl: false, statement_timeout: 30000 });
    await client.connect();
    try {
        await client.query('BEGIN');
        await client.query('CREATE SCHEMA gnosis_search_benchmark');
        await client.query('SET LOCAL search_path=gnosis_search_benchmark');
        await client.query(fs.readFileSync(path.join(__dirname, '../../database/migrations/commentary/20261023000000_baseline.sql'), 'utf8').split('-- Down Migration')[0].replace('-- Up Migration', ''));
        await client.query("INSERT INTO sources (name) VALUES ('Matthew Henry')");
        await client.query("INSERT INTO commentaries (title,source_id) VALUES ('Complete',1)");
        const dir = path.join(__dirname, '../../matthew-henry-restructured');
        let count = 0;
        for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
            const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
            if (!Array.isArray(data.entries)) continue;
            const book = (await client.query('INSERT INTO bible_books (name) VALUES ($1) RETURNING id', [data.book])).rows[0].id;
            for (const e of data.entries) {
                await client.query(`INSERT INTO commentary_entries
                    (commentary_id,book_id,start_chapter,start_verse,end_chapter,end_verse,title,content)
                    VALUES (1,$1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
                [book,e.start_chapter,e.start_verse,e.end_chapter,e.end_verse,e.title,e.content]);
                count++;
            }
        }
        await client.query('ANALYZE commentary_entries');
        const sql = fs.readFileSync(path.join(__dirname, '../src/routes/searchRoutes.js'), 'utf8').match(/`([\s\S]*?)`/g)[1].slice(1,-1);
        // Loopback HTTP exercises the real frontend service against measured SQL results.
        const server = http.createServer(async (req, res) => {
            try {
                const q = new URL(req.url, 'http://localhost').searchParams.get('q');
                const result = await client.query(sql, [q]);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(result.rows));
            } catch { res.writeHead(500); res.end('{}'); }
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const base = `http://127.0.0.1:${server.address().port}`;
        const serviceCode = fs.readFileSync(path.join(__dirname, '../../frontend/src/services/searchService.js'), 'utf8')
            .replace("import API_URL from '../api/api';", `const API_URL = '${base}';`);
        const { searchCommentary } = await import(`data:text/javascript;base64,${Buffer.from(serviceCode).toString('base64')}`);
        const results = [];
        try {
        for (const query of ['a','faith','the love of God','God so loved the world','John 3:16','zzzxnomatch']) {
            const times = [];
            for (let i=0; i<4; i++) {
                const start = performance.now();
                const result = await client.query(sql,[query]);
                assert.ok(result.rows.length <= 100);
                times.push(performance.now()-start);
            }
            const plan = (await client.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+sql,[query])).rows[0]['QUERY PLAN'][0];
            const httpStart = performance.now();
            const originalRows = await (await fetch(`${base}/search/commentary?q=${encodeURIComponent(query)}`)).json();
            const uncachedHttpMs = performance.now() - httpStart;
            await searchCommentary(query);
            const cacheStart = performance.now();
            const cachedRows = await searchCommentary(query);
            const cachedHttpMs = performance.now() - cacheStart;
            assert.deepEqual(cachedRows, originalRows);
            results.push({ query, uncachedHttpMs: Number(uncachedHttpMs.toFixed(2)), cachedHttpMs: Number(cachedHttpMs.toFixed(3)), medianMs: Number(times.sort((a,b)=>a-b)[2].toFixed(2)), rows: plan.Plan['Actual Rows'], plan });
        }
        } finally { await new Promise(resolve => server.close(resolve)); }
        console.log(JSON.stringify({ postgres: (await client.query('SHOW server_version')).rows[0].server_version, entries:count, results },null,2));
    } finally {
        await client.query('ROLLBACK');
        await client.end();
    }
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
