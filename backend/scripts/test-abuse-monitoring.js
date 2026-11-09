// Disposable-cluster runner for the abuse-monitoring integration tests
// and the monitoring script's CLI end-to-end checks.
//
//   npm run test:abuse-monitoring
//
// Provisions a throwaway PostgreSQL 18.6 cluster under
// /var/tmp/pgtest/abuse (2 GB tmpfs; /tmp is 512 MB and too small),
// creates one database named gnosis_migration_test_<16 hex>, applies
// the real app migrations, runs the integration tests, then re-seeds a
// known burst scenario and exercises the monitoring CLI itself
// (alert exit code, --json output, missing-URL refusal, clean-DB OK).
// The database is dropped and the server stopped afterwards; the
// cluster data directory is kept so re-runs skip initdb.
//
// Requirements (same setup PR1 restored): the PG 18 toolchain at
// /usr/lib/postgresql/18/bin and passwordless sudo to the postgres OS
// user. Never points at a live database: every URL is loopback and
// every database name matches gnosis_migration_test_[a-f0-9]{16}.
// No Docker: test-database.js needs it and this VM has none.

const { spawnSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");

const backend = path.resolve(__dirname, "..");
const PG_BIN = "/usr/lib/postgresql/18/bin";
const CLUSTER_DIR = "/var/tmp/pgtest/abuse";
const DATA_DIR = path.join(CLUSTER_DIR, "pg18-data");
const LOG_FILE = path.join(CLUSTER_DIR, "pg.log");
const PORT = 55434;

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        encoding: "utf8",
        timeout: options.timeout || 120000,
        ...options.spawn,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(
            `${command} ${args.join(" ")} failed (status ${result.status}):\n${(result.stderr || result.stdout || "").slice(-2000)}`,
        );
    }
    return result.stdout || "";
}

function sudoPostgres(args, options) {
    return run("sudo", ["-n", "-u", "postgres", ...args], options);
}

function pgCtl(args) {
    return sudoPostgres([path.join(PG_BIN, "pg_ctl"), "-D", DATA_DIR, ...args]);
}

function serverReady() {
    const result = spawnSync(path.join(PG_BIN, "pg_isready"), ["-h", "127.0.0.1", "-p", String(PORT)], {
        encoding: "utf8",
        timeout: 10000,
    });
    return result.status === 0;
}

async function waitReady() {
    for (let i = 0; i < 30; i++) {
        if (serverReady()) return;
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("Disposable PostgreSQL did not become ready.");
}

function dbUrl(name) {
    return `postgresql://postgres@127.0.0.1:${PORT}/${name}`;
}

function migrateUp(name) {
    const env = { ...process.env, MIGRATION_TEST_DATABASE_URL: dbUrl(name) };
    run(process.execPath, ["scripts/migrate.js", "up", "--target", "test", "--project", "app"], {
        spawn: { cwd: backend, env },
    });
    const check = run(process.execPath, ["scripts/migrate.js", "check", "--target", "test", "--project", "app"], {
        spawn: { cwd: backend, env },
    });
    const state = JSON.parse(check);
    assert.deepEqual(state.pending, []);
    assert.equal(state.baselineMatches, true);
}

function createDb(name) {
    sudoPostgres([path.join(PG_BIN, "createdb"), "-h", "127.0.0.1", "-p", String(PORT), name]);
}

function dropDb(name) {
    sudoPostgres([path.join(PG_BIN, "dropdb"), "--if-exists", "-h", "127.0.0.1", "-p", String(PORT), name]);
}

function psqlFile(name, sql) {
    // Under the postgres-owned cluster dir: /tmp files are not reliably
    // readable by the postgres user.
    const file = path.join(CLUSTER_DIR, `gnosis-abuse-seed-${randomBytes(4).toString("hex")}.sql`);
    fs.writeFileSync(file, sql);
    // Explicit chmod: the write mode is masked by the caller's umask
    // (0007 here), which would leave the file unreadable by postgres.
    fs.chmodSync(file, 0o644);
    try {
        sudoPostgres([path.join(PG_BIN, "psql"), "-h", "127.0.0.1", "-p", String(PORT), "-d", name,
            "-v", "ON_ERROR_STOP=1", "-q", "-f", file]);
    } finally {
        fs.unlinkSync(file);
    }
}

function runNode(args, env) {
    return spawnSync(process.execPath, args, {
        cwd: backend,
        env: { ...process.env, PATH: process.env.PATH, ...env },
        encoding: "utf8",
        timeout: 120000,
    });
}

// Fixed synthetic key hash (64 hex chars); a hash value, not a secret.
const SYNTH_KEY_HEX = "a1".repeat(32);
const BURST_SEED_SQL = `
INSERT INTO rate_limit_attempts(key_hash, policy, attempted_at)
SELECT decode('${SYNTH_KEY_HEX}', 'hex'), 'login_ip_email', now() - interval '1 minute'
FROM generate_series(1, 5);
INSERT INTO security_events(kind, user_id, created_at)
SELECT 'login.failure', NULL, now() - interval '30 seconds' FROM generate_series(1, 12);
INSERT INTO security_events(kind, user_id, created_at)
VALUES ('refresh_token.reused', 7, now());
`;

async function main() {
    if (!fs.existsSync(path.join(PG_BIN, "pg_ctl"))) {
        throw new Error(`PG 18 toolchain missing at ${PG_BIN}; reinstall it (see AGENTS.md) before running this.`);
    }
    sudoPostgres(["mkdir", "-p", CLUSTER_DIR]);
    if (!fs.existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
        console.log("initdb: creating disposable cluster (first run only)...");
        sudoPostgres([path.join(PG_BIN, "initdb"), "-D", DATA_DIR, "--auth=trust", "-E", "UTF8", "-U", "postgres"]);
    }
    let started = false;
    if (!serverReady()) {
        pgCtl(["-l", LOG_FILE, "-o", `-p ${PORT} -k ${CLUSTER_DIR} -c listen_addresses=127.0.0.1`, "-w", "start"]);
        started = true;
    }
    await waitReady();
    const dbName = `gnosis_migration_test_${randomBytes(8).toString("hex")}`;
    try {
        // 1. Integration tests against the real migrations.
        createDb(dbName);
        migrateUp(dbName);
        console.log(`integration: database ${dbName} migrated; running tests...`);
        const tests = runNode(["--test", "test/security-monitoring/abuseMonitoring.integration.test.js"], {
            GNOSIS_ABUSE_MONITOR_TEST_DATABASE_URL: dbUrl(dbName),
        });
        process.stdout.write(tests.stdout);
        process.stderr.write(tests.stderr);
        assert.equal(tests.status, 0, "abuse-monitoring integration tests failed");

        // 2. CLI end-to-end checks against a freshly seeded burst.
        dropDb(dbName);
        createDb(dbName);
        migrateUp(dbName);
        psqlFile(dbName, BURST_SEED_SQL);
        const usageFixture = path.join(os.tmpdir(), `gnosis-abuse-usage-${randomBytes(4).toString("hex")}.json`);
        // Recorded 2026-11-09 via `neon.py usage`: Commentary preview
        // 903,856,128 B (862.0 MiB), total 935,575,552 B, 1.27 CU-hours.
        fs.writeFileSync(usageFixture, JSON.stringify({
            project_id: "hidden-mud-12990395",
            project_name: "gnosis-commentary",
            period_start: "2026-11-01T00:00:00Z",
            period_end: "2026-12-01T00:00:00Z",
            compute_cu_hours: 1.2708333333333333,
            storage_total_bytes: 935575552,
            branches: [
                { id: "br-frosty-boat-bbf3re5m", name: "preview", logical_size_bytes: 903856128 },
                { id: "br-dry-wildflower-bbyvolbd", name: "production", logical_size_bytes: 31719424 },
            ],
        }));
        try {
            const burst = runNode(
                ["scripts/security-monitoring.js", "--usage-file", usageFixture],
                { GNOSIS_MONITOR_DATABASE_URL: dbUrl(dbName) },
            );
            assert.equal(burst.status, 2, "burst scenario must exit 2 (alert)");
            assert.match(burst.stdout, /\[ALERT\] login\.failure\/minute/);
            assert.match(burst.stdout, /\[ALERT\] refresh_token\.reused\/hour/);
            assert.match(burst.stdout, /gnosis-commentary: 892\.2 MiB total storage, 1\.27 CU-hours/);
            assert.match(burst.stdout, /Status: ALERT/);

            const burstJson = runNode(
                ["scripts/security-monitoring.js", "--usage-file", usageFixture, "--json"],
                { GNOSIS_MONITOR_DATABASE_URL: dbUrl(dbName) },
            );
            assert.equal(burstJson.status, 2);
            assert.equal(JSON.parse(burstJson.stdout).status, "alert");

            const noUrl = runNode(["scripts/security-monitoring.js"], {
                GNOSIS_MONITOR_DATABASE_URL: "",
            });
            assert.equal(noUrl.status, 2);
            assert.match(noUrl.stderr, /GNOSIS_MONITOR_DATABASE_URL is required/);

            dropDb(dbName);
            createDb(dbName);
            migrateUp(dbName);
            const cleanRun = runNode(["scripts/security-monitoring.js"], {
                GNOSIS_MONITOR_DATABASE_URL: dbUrl(dbName),
            });
            assert.equal(cleanRun.status, 0, `clean database must exit 0, got ${cleanRun.status}: ${cleanRun.stdout}`);
            assert.match(cleanRun.stdout, /Status: OK/);
            console.log("cli: burst alerts (exit 2), --json, missing-URL refusal, and clean-DB OK all verified.");
        } finally {
            fs.unlinkSync(usageFixture);
        }
        console.log("test:abuse-monitoring: PASS");
    } finally {
        try { dropDb(dbName); } catch { /* teardown is best-effort */ }
        try {
            if (started) pgCtl(["-m", "fast", "-w", "stop"]);
            else if (serverReady()) pgCtl(["-m", "fast", "-w", "stop"]);
        } catch { /* teardown is best-effort */ }
    }
}

main().then(
    () => { process.exitCode = 0; },
    (error) => {
        console.error(`test-abuse-monitoring: ${error.message}`);
        process.exitCode = 1;
    },
);
