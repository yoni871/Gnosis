const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { testEnvironment } = require("../../scripts/test");

const backendDir = path.join(__dirname, "..", "..");

function childEnv(extra) {
    const env = testEnvironment();
    for (const [key, value] of Object.entries(extra)) {
        if (value === undefined) {
            delete env[key];
        } else {
            env[key] = value;
        }
    }
    return env;
}

function waitForExit(child, timeoutMs) {
    return new Promise((resolve, reject) => {
        if (child.exitCode !== null) return resolve(child.exitCode);
        const timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error("child did not exit in time"));
        }, timeoutMs);
        child.once("exit", (code) => {
            clearTimeout(timer);
            resolve(code);
        });
    });
}

function waitForOutput(stream, needle, timeoutMs) {
    return new Promise((resolve, reject) => {
        let buffer = "";
        const timer = setTimeout(() => {
            stream.off("data", onData);
            reject(new Error(`timed out waiting for output: ${needle}`));
        }, timeoutMs);
        const onData = (chunk) => {
            buffer += chunk.toString();
            if (buffer.includes(needle)) {
                clearTimeout(timer);
                stream.off("data", onData);
                resolve(buffer);
            }
        };
        stream.on("data", onData);
    });
}

function spawnServer(port, extraEnv) {
    // Observe the OS-assigned port without changing application startup behavior.
    const script = `
        const http = require("node:http");
        const listen = http.Server.prototype.listen;
        http.Server.prototype.listen = function (...args) {
            this.once("listening", () => console.log("TEST_PORT=" + this.address().port));
            args.splice(1, 0, "127.0.0.1");
            return listen.apply(this, args);
        };
        require("./src/server");
    `;
    const child = spawn(process.execPath, ["-e", script], {
        cwd: backendDir,
        env: childEnv({ PORT: String(port), ...extraEnv }),
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
    });
    return {
        child,
        stderr: () => stderr,
        stop: async () => {
            if (child.exitCode === null) {
                child.kill("SIGTERM");
                try {
                    await waitForExit(child, 5000);
                } catch {
                    child.kill("SIGKILL");
                }
            }
        },
    };
}

const MARKER = "marker-that-must-never-appear-12345";

test("refuses to start without JWT_SECRET in development mode", async () => {
    const { child, stderr } = spawnServer(0, {
        NODE_ENV: "development",
        JWT_SECRET: undefined,
        TEST_SECRET_MARKER: MARKER,
    });
    const code = await waitForExit(child, 15000);
    assert.notEqual(code, 0);
    assert.ok(stderr().includes("Server configuration error"), stderr());
    assert.ok(!stderr().includes(MARKER), stderr());
    assert.ok(!stderr().includes("JWT_SECRET"), stderr());
});

test("refuses to start without JWT_SECRET in production mode", async () => {
    const { child, stderr } = spawnServer(0, {
        NODE_ENV: "production",
        JWT_SECRET: undefined,
        TEST_SECRET_MARKER: MARKER,
    });
    const code = await waitForExit(child, 15000);
    assert.notEqual(code, 0);
    assert.ok(stderr().includes("Server configuration error"), stderr());
    assert.ok(!stderr().includes(MARKER), stderr());
});

async function malformedJsonInMode(mode, port) {
    const server = spawnServer(port, {
        NODE_ENV: mode,
        JWT_SECRET: "test-secret-for-server-config-tests",
    });
    try {
        const output = await waitForOutput(server.child.stdout, "TEST_PORT=", 15000);
        port = Number(output.match(/TEST_PORT=(\d+)/)[1]);
        const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Connection: "close" },
            body: "{not json",
        });
        const text = await response.text();
        assert.equal(response.status, 400);
        assert.match(response.headers.get("content-type") || "", /application\/json/);
        assert.deepEqual(JSON.parse(text), {
            error: "Invalid request body.",
            code: "INVALID_BODY",
        });
        assert.ok(!text.includes("<!DOCTYPE"), text);
        assert.ok(!text.includes(" at "), text);
    } finally {
        await server.stop();
    }
}

test("development mode returns JSON, not HTML or a stack trace", async () => {
    await malformedJsonInMode("development", 0);
});

test("production mode returns JSON, not HTML or a stack trace", async () => {
    await malformedJsonInMode("production", 0);
});
