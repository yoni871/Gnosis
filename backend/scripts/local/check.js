// Read-only checks through the actual Vite proxy; no credentials or database writes.
const assert = require('node:assert/strict');
(async () => {
    const base = 'http://localhost:5173';
    for (const route of ['/api/books', '/api/books/1/chapters', '/api/translations',
        '/api/commentaries', '/api/bible/Genesis/1/BSB', '/api/bible/John/3/KJV',
        '/api/bible/Genesis/1/ASV', '/api/books/1/chapters/1/commentaries?commentaryId=1']) {
        const response = await fetch(base + route, {signal: AbortSignal.timeout(10000)});
        assert.equal(response.status, 200, route);
        const body = await response.json();
        assert.ok(Array.isArray(body) && body.length > 0, route);
        console.log(`${route}: OK (${body.length} rows)`);
    }
    const response = await fetch(base + '/api/auth/profile');
    assert.equal(response.status, 401, 'Protected profile must require authentication');
    console.log('Protected profile rejects anonymous access.');
})().catch(() => {console.error('Local smoke check failed; start both servers after local:prepare.'); process.exitCode=1;});
