import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import process from 'node:process';
// This test server must never inherit an application database or environment.
for (const name of Object.keys(process.env)) if (/^(DB_|PG|DATABASE_URL|GNOSIS_.*DATABASE_URL|GNOSIS_SPLIT_REQUIRED|GNOSIS_LOCAL_DEV)/.test(name)) delete process.env[name];
process.env.GNOSIS_TEST_ISOLATION = '1';
const backendRequire = createRequire(new URL('../../backend/package.json', import.meta.url));
const express = backendRequire('express');
const { resolveTrustProxy } = backendRequire('./src/utils/rateLimit');
// securityHeaders.js exports a named object (see backend/src/app.js);
// the middleware itself is the `securityHeaders` property, not the
// whole module.
const { securityHeaders: apiHeaders } = backendRequire('./src/middleware/securityHeaders');
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const headers = Object.fromEntries(config.headers.find(rule => rule.source === '/(.*)').headers.map(h => [h.key, h.value]));
// Test-only allowance: the synthetic API host (api.example.invalid) must
// be reachable or the app cannot load Bible data at all (the reader
// shows "couldn't load the Bible text"). The real connect-src is
// 'self' + https://*.vercel.app; the fixture appends the synthetic host
// so the app's fetches reach the Playwright interceptor. No other CSP
// directive is changed — the header assertions still pin the real
// frame-ancestors, object-src, and script-src values.
if (typeof headers['Content-Security-Policy'] === 'string') {
    headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace(
        /(connect-src[^;]*)/, '$1 https://api.example.invalid'
    );
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };
const listen = server => new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
});
const close = server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
export async function startFixture() {
    const app = express();
    app.disable('x-powered-by'); app.set('trust proxy', resolveTrustProxy('loopback')); app.use(apiHeaders);
    let calls = 0;
    const forwarded = ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'x-vercel-forwarded-for', 'cf-connecting-ip', 'true-client-ip'];
    app.all('/api/auth/:action', (req, res) => {
        calls++;
        res.set('Cache-Control', 'no-store');
        if (req.params.action === 'refresh') return res.status(401).json({ error: 'No synthetic session.', code: 'SESSION_INVALID' });
        res.json({ ip: req.ip, host: req.headers.host, forwarded: Object.fromEntries(forwarded.map(name => [name, req.headers[name] || null])) });
    });
    const backend = http.createServer(app);
    const target = await listen(backend);
    process.env.GNOSIS_API_BASE_URL = target;
    const { default: proxy } = await import('../api/auth/[...path].js');
    const frontend = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://fixture.invalid');
            if (url.pathname.startsWith('/api/auth/')) return await proxy(req, res);
            if (url.pathname === '/__fixture_calls') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ calls })); }
            if (url.pathname === '/__fixture_frame') { res.setHeader('Content-Type', 'text/html'); return res.end('<iframe src="/login"></iframe>'); }
            for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
            const candidate = path.resolve(dist, '.' + decodeURIComponent(url.pathname));
            if (candidate !== path.resolve(dist) && !candidate.startsWith(path.resolve(dist) + path.sep)) { res.writeHead(400); return res.end(); }
            const file = fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.join(dist, 'index.html');
            res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
            res.end(fs.readFileSync(file));
        } catch { if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end('{"error":"Synthetic service failure."}'); } else res.destroy(); }
    });
    try {
        const origin = await listen(frontend);
        // Cross-origin framing probe: the backend target is a different
        // origin from the frontend (different port), so a page served
        // here that frames the app is a genuine cross-origin framer.
        // The app's frame-ancestors 'self' / SAMEORIGIN must refuse it.
        // (Same-origin framing is allowed by main's deliberate 'self'
        // policy — see backend/src/middleware/securityHeaders.js — so
        // the framing test uses this cross-origin parent, not the
        // same-origin /__fixture_frame page.)
        app.get('/__xorigin_frame', (req, res) => {
            // The parent page itself must impose NO framing restriction:
            // the backend middleware sets default-src 'self', which would
            // block this cross-origin iframe on the parent's side and the
            // console message would cite default-src instead of the app's
            // frame-ancestors. Strip the parent's CSP/X-Frame-Options so
            // the only thing that can refuse the frame is the app's own
            // frame-ancestors 'self' / SAMEORIGIN.
            res.removeHeader('Content-Security-Policy');
            res.removeHeader('X-Frame-Options');
            res.set('Content-Type', 'text/html');
            res.end(`<iframe src="${origin}/login"></iframe>`);
        });
        return { origin, target, async close() { await close(frontend); await close(backend); await backendRequire('./src/db/db').end(); } };
    } catch (error) { await close(backend); throw error; }
}
