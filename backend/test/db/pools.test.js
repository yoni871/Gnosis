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
