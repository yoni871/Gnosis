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
    assert.deepEqual(result.app.options.ssl, { rejectUnauthorized: true });
});

test("a remote URL without sslmode still forces verified TLS", () => {
    const result = pools({
        DATABASE_URL: "postgresql://role@ep-test-12345678.us-east-1.aws.neon.tech:5432/neondb",
    });
    assert.deepEqual(result.app.options.ssl, { rejectUnauthorized: true });
});

test("a loopback URL leaves TLS unset (local development has no certificates)", () => {
    const result = pools({ DATABASE_URL: "postgresql://role@127.0.0.1:5432/gnosis" });
    assert.equal(result.app.options.ssl, undefined);
});

test("sslmode=disable fails fast instead of connecting in plaintext", () => {
    assert.throws(() => pools({
        DATABASE_URL: "postgresql://role@ep-test-12345678.us-east-1.aws.neon.tech:5432/neondb?sslmode=disable",
    }), /sslmode=disable/);
});

test("pools set statement and lock timeouts (F04 budgets)", () => {
    const result = pools({
        DATABASE_URL: "postgresql://role@127.0.0.1:5432/gnosis",
    });
    for (const createdPool of [result.app, result.bible, result.commentary]) {
        assert.equal(createdPool.options.statement_timeout, 10000);
        assert.equal(createdPool.options.lock_timeout, 5000);
    }
});

test("an idle pool error logs only the subsystem and safe code", () => {
    const seen = [];
    const original = console.error;
    console.error = (...args) => {
        seen.push(args.join(" "));
    };
    try {
        const result = pools({
            DB_USER: "operator",
            DB_HOST: "127.0.0.1",
            DB_NAME: "gnosis",
            DB_PORT: "5432",
        });
        const fakeUrl = ["postgres", "://", "dbuser", ":", "dbpass",
            "@", "db.example.invalid", ":5432/gnosis"].join("");
        const error = new Error(
            "connect ECONNREFUSED 10.0.0.1:5432 " + fakeUrl
        );
        error.code = "ECONNREFUSED";
        result.app.emit("error", error);
    } finally {
        console.error = original;
    }
    const text = seen.join("\n");
    assert.equal(seen.length, 1);
    assert.ok(text.includes("[db] pool error code=ECONNREFUSED"), text);
    assert.ok(!text.includes("db.example.invalid"), text);
    assert.ok(!text.includes("dbpass"), text);
    assert.ok(!text.includes("10.0.0.1"), text);
});
