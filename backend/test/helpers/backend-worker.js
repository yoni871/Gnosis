const { createTestPool, installApplicationPool } = require('./application-database');

let database;
let server;
let stopping;
let started = false;
async function stop(code = 0) {
    if (!stopping) stopping = (async () => {
        try {
            if (server) {
                server.closeAllConnections();
                await new Promise(resolve => server.close(resolve));
            }
            if (database) await database.close();
        } catch { code = 1; }
        process.exit(code);
    })();
    return stopping;
}
process.on('disconnect', () => stop());
process.on('SIGTERM', () => stop());
process.on('SIGINT', () => stop());
process.on('message', async message => {
    if (message.type === 'stop') return stop();
    if (message.type !== 'start' || started) return stop(1);
    started = true;
    try {
        // Refuse external HTTP/email transports. These workers serve inbound
        // loopback requests; tests use explicit fakes for future delivery adapters.
        // Issue #9: loopback destinations stay reachable so a test file can
        // run a local delivery stub for the resend client. Anything that is
        // not loopback is still refused, so no real provider is ever called.
        const originalFetch = global.fetch;
        const isLoopbackHost = (host) => {
            if (typeof host !== 'string') return false;
            const name = host.split(':')[0].toLowerCase().replace(/^\[|\]$/g, '');
            return name === '127.0.0.1' || name === '::1' || name === 'localhost';
        };
        const blocked = () => { throw new Error('External network calls are disabled in application tests.'); };
        global.fetch = (input, init) => {
            let url;
            try {
                const raw = typeof input === 'string' ? input : (input.url || input.href);
                url = new URL(raw);
            } catch {
                blocked();
            }
            if (!isLoopbackHost(url.hostname)) blocked();
            return originalFetch(input, init);
        };
        for (const name of ['node:http', 'node:https']) {
            const transport = require(name);
            const originalRequest = transport.request;
            const originalGet = transport.get;
            const hostOf = (options) => {
                if (typeof options === 'string') {
                    try { return new URL(options).hostname; } catch { return ''; }
                }
                if (options && typeof options === 'object') return options.hostname || options.host || '';
                return '';
            };
            transport.request = (options, ...rest) => {
                if (!isLoopbackHost(hostOf(options))) blocked();
                return originalRequest.call(transport, options, ...rest);
            };
            transport.get = (options, ...rest) => {
                if (!isLoopbackHost(hostOf(options))) blocked();
                return originalGet.call(transport, options, ...rest);
            };
        }
        database = await createTestPool(message.context);
        installApplicationPool(database.pool);
        const app = require('../../src/app');
        server = app.listen(0, '127.0.0.1');
        await new Promise((resolve, reject) => {
            server.once('listening', resolve);
            server.once('error', reject);
        });
        if (process.connected) process.send({ type: 'ready', port: server.address().port });
        else await stop();
    } catch { await stop(1); }
});
