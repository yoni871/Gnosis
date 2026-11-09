const test = require("node:test");
const assert = require("node:assert/strict");

// Explicit isolation also protects direct node --test invocations.
process.env.GNOSIS_TEST_ISOLATION = "1";

const { createPools } = require("../../src/db/db");

// Pools created per test are closed in afterEach so no test keeps the
// process alive. The connection strings are synthetic and never dialled:
// creating a Pool opens no connection until the first query.
const created = new Set();
function pools(env) {
    const result = createPools(env);
    created.add(result.app);
    created.add(result.bible);
    created.add(result.commentary);
    return result;
}

test.afterEach(async () => {
    for (const pool of created) {
        await pool.end().catch(() => {});
    }
    created.clear();
});

test("without split URLs all three projects share one pool", () => {
    const result = pools({ DATABASE_URL: "postgresql://role@127.0.0.1:5432/gnosis" });
    assert.equal(result.bible, result.app);
    assert.equal(result.commentary, result.app);
});

test("without any URL the local fallback shares one pool", () => {
    const result = pools({ DB_USER: "operator", DB_HOST: "127.0.0.1", DB_NAME: "gnosis", DB_PORT: "5432" });
    assert.equal(result.bible, result.app);
    assert.equal(result.commentary, result.app);
});

test("distinct split URLs create distinct pools", () => {
    const result = pools({
        GNOSIS_APP_DATABASE_URL: "postgresql://role@127.0.0.1:5432/gnosis_app",
        GNOSIS_BIBLE_DATABASE_URL: "postgresql://role@127.0.0.1:5432/gnosis_bible",
        GNOSIS_COMMENTARY_DATABASE_URL: "postgresql://role@127.0.0.1:5432/gnosis_commentary",
    });
    assert.notEqual(result.bible, result.app);
    assert.notEqual(result.commentary, result.app);
    assert.notEqual(result.commentary, result.bible);
});

test("only the Bible URL set splits Bible off and leaves Commentary on the App pool", () => {
    const result = pools({
        DATABASE_URL: "postgresql://role@127.0.0.1:5432/gnosis",
        GNOSIS_BIBLE_DATABASE_URL: "postgresql://role@127.0.0.1:5432/gnosis_bible",
    });
    assert.notEqual(result.bible, result.app);
    assert.equal(result.commentary, result.app);
});

test("an App URL alone keeps all three on the same pool", () => {
    const result = pools({
        DATABASE_URL: "postgresql://role@127.0.0.1:5432/gnosis",
        GNOSIS_APP_DATABASE_URL: "postgresql://role@127.0.0.1:5432/gnosis_app",
    });
    assert.equal(result.bible, result.app);
    assert.equal(result.commentary, result.app);
});

test("GNOSIS_SPLIT_REQUIRED=1 with all three split URLs creates three pools", () => {
    const result = pools({
        GNOSIS_SPLIT_REQUIRED: "1",
        GNOSIS_APP_DATABASE_URL: "postgresql://role@127.0.0.1:5432/gnosis_app",
        GNOSIS_BIBLE_DATABASE_URL: "postgresql://role@127.0.0.1:5432/gnosis_bible",
        GNOSIS_COMMENTARY_DATABASE_URL: "postgresql://role@127.0.0.1:5432/gnosis_commentary",
    });
    assert.notEqual(result.bible, result.app);
    assert.notEqual(result.commentary, result.app);
    assert.notEqual(result.commentary, result.bible);
});

test("GNOSIS_SPLIT_REQUIRED=1 without a split URL fails fast instead of falling back", () => {
    assert.throws(() => pools({
        GNOSIS_SPLIT_REQUIRED: "1",
        DATABASE_URL: "postgresql://role@127.0.0.1:5432/gnosis",
        GNOSIS_APP_DATABASE_URL: "postgresql://role@127.0.0.1:5432/gnosis_app",
        GNOSIS_BIBLE_DATABASE_URL: "postgresql://role@127.0.0.1:5432/gnosis_bible",
    }), /GNOSIS_COMMENTARY_DATABASE_URL/);
});

test("GNOSIS_SPLIT_REQUIRED=1 with no split URLs at all fails fast", () => {
    assert.throws(() => pools({
        GNOSIS_SPLIT_REQUIRED: "1",
        DATABASE_URL: "postgresql://role@127.0.0.1:5432/gnosis",
    }), /GNOSIS_APP_DATABASE_URL.*GNOSIS_BIBLE_DATABASE_URL.*GNOSIS_COMMENTARY_DATABASE_URL/);
});

test("a remote URL forces verified TLS regardless of its sslmode", () => {
    const result = pools({
        DATABASE_URL: "postgresql://role@ep-test-12345678.us-east-1.aws.neon.tech:5432/neondb?sslmode=require",
    });
    assert.equal(new (require("pg").Client)(result.app.options).connectionParameters.ssl.rejectUnauthorized, true);
});

test("a remote URL without sslmode still forces verified TLS", () => {
    const result = pools({
        DATABASE_URL: "postgresql://role@ep-test-12345678.us-east-1.aws.neon.tech:5432/neondb",
    });
    assert.equal(new (require("pg").Client)(result.app.options).connectionParameters.ssl.rejectUnauthorized, true);
});

test("a loopback URL leaves TLS unset (local development has no certificates)", () => {
    const result = pools({ DATABASE_URL: "postgresql://role@127.0.0.1:5432/gnosis" });
    assert.equal(result.app.options.ssl, undefined);
});

test("sslmode=disable fails fast instead of connecting in plaintext", () => {
    assert.throws(() => pools({
        DATABASE_URL: "postgresql://role@ep-test-12345678.us-east-1.aws.neon.tech:5432/neondb?sslmode=disable",
    }), /unsafe database/);
});


test("URL compatibility flags cannot disable certificate or hostname verification", () => {
    for (const query of ["sslmode=require&uselibpqcompat=true", "sslmode=prefer&uselibpqcompat=true", "ssl=0"]) {
        const result = pools({ DATABASE_URL: `postgresql://role@example.invalid/test?${query}` });
        const client = new (require("pg").Client)(result.app.options);
        assert.equal(client.connectionParameters.ssl.rejectUnauthorized, true);
        assert.equal(client.connectionParameters.ssl.checkServerIdentity, require("node:tls").checkServerIdentity);
    }
});
test("URL timeouts/startup options cannot override resource bounds", () => {
    const result = pools({ DATABASE_URL: "postgresql://role@127.0.0.1/test?statement_timeout=0&query_timeout=0&options=-c%20statement_timeout%3D0" });
    const parameters = new (require("pg").Client)(result.app.options).connectionParameters;
    assert.equal(parameters.statement_timeout, 5000);
    assert.equal(parameters.lock_timeout, 1000);
    assert.equal(parameters.query_timeout, 6000);
    assert.equal(parameters.options, "-c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=5000");
});
test("invalid, unlimited and inverted database budgets fail without leaking values", () => {
    for (const env of [{ DB_STATEMENT_TIMEOUT_MS: "0" }, { DB_STATEMENT_TIMEOUT_MS: "5000junk" },
        { DB_STATEMENT_TIMEOUT_MS: "private-marker" }, { DB_POOL_MAX: "1000" },
        { DB_STATEMENT_TIMEOUT_MS: "500", DB_LOCK_TIMEOUT_MS: "1000" }]) {
        assert.throws(() => pools(env), error => !error.message.includes("private-marker"));
    }
});
test("idle connection diagnostics never expose errors, details or URLs", t => {
    const result = pools({});
    const logs = [];
    t.mock.method(console, 'error', value => logs.push(value));
    result.app.emit('error', Object.assign(new Error('private-marker'), { detail: 'private-marker', code: '08006' }));
    assert.deepEqual(JSON.parse(logs[0]), { operation: 'database.idle', code: '08006' });
    assert.ok(!logs.join('').includes('private-marker'));
});
