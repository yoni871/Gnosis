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
        const blocked = () => { throw new Error('External network calls are disabled in application tests.'); };
        global.fetch = blocked;
        for (const name of ['node:http', 'node:https']) {
            const transport = require(name);
            transport.request = blocked;
            transport.get = blocked;
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
