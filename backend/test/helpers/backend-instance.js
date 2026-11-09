const { fork } = require('node:child_process');
const path = require('node:path');
const { validateContext } = require('./application-database');

// Independent allowlist: never forward a parent test's migration/operator settings,
// NODE_OPTIONS, execArgv, dotenv paths, or database defaults to an application worker.
function workerEnvironment() {
    const env = { GNOSIS_TEST_ISOLATION: '1', NODE_ENV: 'test',
        JWT_SECRET: 'synthetic-application-test-jwt-synthetic-test-secret',
        RATE_LIMIT_KEY_SECRET: 'synthetic-application-test-rate-limit', TZ: 'UTC',
        // Issue #9: workers import app.js, which validates email
        // configuration at import time. These synthetic, non-routable
        // values satisfy validation without ever sending real email;
        // delivery in application tests goes to a loopback stub.
        RESEND_API_KEY: 'synthetic-application-test-resend-key',
        EMAIL_FROM: 'Gnosis Test <test@example.invalid>',
        FRONTEND_URL: 'https://frontend.example.invalid' };
    for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TMPDIR', 'TMP', 'TEMP']) {
        if (process.env[key]) env[key] = process.env[key];
    }
    // Issue #9: a test file may point workers at its loopback delivery
    // stub. The override is honored only under test isolation (workers
    // always run isolated), and production ignores it entirely.
    if (process.env.RESEND_API_BASE_URL) env.RESEND_API_BASE_URL = process.env.RESEND_API_BASE_URL;
    // PR3 (N07): same loopback pattern as Resend — register/reset screen
    // passwords against HIBP, and no test may call the real
    // api.pwnedpasswords.com.
    if (process.env.HIBP_API_BASE_URL) env.HIBP_API_BASE_URL = process.env.HIBP_API_BASE_URL;
    // TOTP MFA: a test file may point workers at a synthetic encryption
    // key, so MFA flows can run against the disposable database. The
    // override is honored only under test isolation, mirroring the
    // delivery-stub override above.
    if (process.env.MFA_ENCRYPTION_KEY) env.MFA_ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY;
    return env;
}

async function startBackend(value) {
    const context = validateContext(value);
    const child = fork(path.join(__dirname, 'backend-worker.js'), [], {
        env: workerEnvironment(), execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    child.on('error', () => {}); // Readiness reports a fixed safe error below.
    const exited = new Promise(resolve => child.once('close', resolve));
    let stopPromise;
    function stop() {
        if (!stopPromise) stopPromise = (async () => {
            if (!child.pid) return;
            if (child.exitCode !== null || child.signalCode !== null) {
                if (child.exitCode !== 0) throw new Error('Application worker exited unexpectedly.');
                return;
            }
            if (child.connected) child.send({ type: 'stop' }, () => {});
            const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
            try {
                const code = await exited;
                if (code !== 0) throw new Error('Application worker cleanup failed.');
            } finally { clearTimeout(timer); }
        })();
        return stopPromise;
    }
    try {
        const ready = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => fail(), 10000);
            const fail = () => {
                clearTimeout(timer);
                reject(new Error('Application worker failed before readiness.'));
            };
            child.once('error', fail);
            child.once('exit', fail);
            child.once('message', message => {
                clearTimeout(timer);
                child.removeListener('error', fail);
                child.removeListener('exit', fail);
                if (message.type !== 'ready' || !Number.isInteger(message.port) ||
                    message.port < 1 || message.port > 65535) return fail();
                resolve(message);
            });
            child.send({ type: 'start', context }, () => {});
        });
        return { url: `http://127.0.0.1:${ready.port}`, pid: child.pid, stop };
    } catch (error) { await stop().catch(() => {}); throw error; }
}

module.exports = { startBackend, workerEnvironment };
