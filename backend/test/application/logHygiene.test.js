const test = require("node:test");
const assert = require("node:assert/strict");

// Explicit isolation also protects direct node --test invocations.
process.env.GNOSIS_TEST_ISOLATION = "1";

const {
    logControllerError,
    logPoolError,
} = require("../../src/utils/authErrors");
const { getNotes } = require("../../src/controllers/notesController");
const pool = require("../../src/db/db");
const { reportFums } = require("../../src/services/licensed/licensedTranslations");

// A database error shaped like the ones that used to reach the logs:
// the message embeds submitted note content and a column name, and
// the stack embeds a filesystem path. None of that may appear in a
// log line; only the route, the kind, and the safe code may.
function nastyDbError() {
    const error = new Error(
        "duplicate key value violates unique constraint " +
        "\"notes_pkey\" DETAIL: Key (content)=(SECRET_NOTE_CONTENT " +
        "password_hash) already exists."
    );
    error.code = "42P01";
    error.stack = "Error: boom\n    at /secret/path/server.js:1:1";
    return error;
}

// Capture everything written to console.error while fn runs, then
// restore the original. fn may be async.
async function captureConsoleError(fn) {
    const seen = [];
    const original = console.error;
    console.error = (...args) => {
        seen.push(args.join(" "));
    };
    try {
        await fn();
    } finally {
        console.error = original;
    }
    return seen;
}

function fakeRes() {
    const res = {};
    res.statusCode = null;
    res.body = null;
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (body) => {
        res.body = body;
        return res;
    };
    return res;
}

test("logControllerError logs only route, kind, and safe code", async () => {
    const seen = await captureConsoleError(async () => {
        logControllerError("notes.list", "database", nastyDbError());
    });
    const text = seen.join("\n");
    assert.equal(seen.length, 1);
    assert.ok(text.includes("notes.list"), text);
    assert.ok(text.includes("kind=database"), text);
    assert.ok(text.includes("code=42P01"), text);
    assert.ok(!text.includes("SECRET_NOTE_CONTENT"), text);
    assert.ok(!text.includes("password_hash"), text);
    assert.ok(!text.includes("duplicate key"), text);
    assert.ok(!text.includes("/secret/path"), text);
    assert.ok(!text.includes("notes_pkey"), text);
});

test("logControllerError with a missing or codeless error logs code=none", async () => {
    const seen = await captureConsoleError(async () => {
        logControllerError("notes.list", "database", null);
        logControllerError("notes.list", "database", undefined);
        logControllerError("notes.list", "database", new Error("boom"));
        logControllerError("notes.list", "database", { code: 42 });
    });
    assert.equal(seen.length, 4);
    for (const line of seen) {
        assert.ok(line.includes("code=none"), line);
        assert.ok(!line.includes("undefined"), line);
        assert.ok(!line.includes("boom"), line);
    }
});

test("logPoolError logs only the subsystem and safe code", async () => {
    const error = new Error(
        "connect ECONNREFUSED 10.0.0.1:5432 " +
        "postgres://dbuser:dbpass@db.example.invalid:5432/gnosis"
    );
    error.code = "ECONNREFUSED";
    const seen = await captureConsoleError(async () => {
        logPoolError(error);
    });
    const text = seen.join("\n");
    assert.equal(seen.length, 1);
    assert.ok(text.includes("[db] pool error code=ECONNREFUSED"), text);
    assert.ok(!text.includes("db.example.invalid"), text);
    assert.ok(!text.includes("dbpass"), text);
    assert.ok(!text.includes("10.0.0.1"), text);
});

test("a notes-list database failure logs only allowlisted fields", async () => {
    const originalQuery = pool.query;
    pool.query = async () => {
        throw nastyDbError();
    };
    const res = fakeRes();
    try {
        const seen = await captureConsoleError(async () => {
            // #91's getNotes parses pagination from req.query first, so
            // the fake request carries an empty query (Express always
            // sets req.query, even with no query string).
            await getNotes({ user: { userId: 7 }, query: {} }, res);
        });
        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { error: "Failed to retrieve notes." });
        const text = seen.join("\n");
        assert.equal(seen.length, 1);
        assert.ok(text.includes("notes.list"), text);
        assert.ok(text.includes("kind=database"), text);
        assert.ok(text.includes("code=42P01"), text);
        assert.ok(!text.includes("SECRET_NOTE_CONTENT"), text);
        assert.ok(!text.includes("password_hash"), text);
        assert.ok(!text.includes("duplicate key"), text);
        assert.ok(!text.includes("/secret/path"), text);
    } finally {
        pool.query = originalQuery;
    }
});

test("a FUMS report failure logs only route and kind, never the token", async () => {
    const seen = await captureConsoleError(async () => {
        await reportFums("SECRET_FUMS_TOKEN", {
            fetchImpl: async () => {
                throw new Error(
                    "fetch failed for https://fums.example.invalid/?t=SECRET_FUMS_TOKEN"
                );
            },
        });
    });
    const text = seen.join("\n");
    assert.equal(seen.length, 1);
    assert.ok(text.includes("licensed.fums"), text);
    assert.ok(text.includes("kind=report-failed"), text);
    assert.ok(!text.includes("SECRET_FUMS_TOKEN"), text);
    assert.ok(!text.includes("fums.example.invalid"), text);
});

test.after(async () => {
    await pool.end().catch(() => {});
});
