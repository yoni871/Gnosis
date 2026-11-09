// Own a freshly initialized cluster only. Never use an existing PGDATA, service,
// socket, credentials, application URL or operator database.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const { testEnvironment } = require('../test');
async function start(bin, version) {
    if (!path.isAbsolute(bin)) throw new Error('An absolute PostgreSQL binary directory is required.');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gnosis-disposable-pg-'));
    const data = path.join(root, 'data');
    let running = false;
    const run = (command, args) => {
        const result = spawnSync(path.join(bin, command), args, { env: { ...testEnvironment(), LC_ALL: 'C' },
            encoding: 'utf8', timeout: 30000 });
        if (result.status !== 0) throw new Error('Disposable PostgreSQL command failed.');
        return result.stdout;
    };
    const stop = async () => {
        if (running) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
        running = false;
        fs.rmSync(root, { recursive: true, force: true });
    };
    try {
        if (!run('postgres', ['--version']).includes(` ${version}.`)) throw new Error('Unexpected PostgreSQL major version.');
        run('initdb', ['-D', data, '-U', 'gnosis_test', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
        const probe = net.createServer();
        await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
        const port = probe.address().port;
        await new Promise(resolve => probe.close(resolve));
        run('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-w', 'start',
            '-o', `-h 127.0.0.1 -p ${port} -k ${root} -F`]);
        running = true;
        return { port, stop };
    } catch (error) { await stop(); throw error; }
}
module.exports = { start };
