// Unit tests for the auth session guard (authSession.js).
//
// Scope, stated plainly: these tests verify the guard's epoch semantics
// in isolation, including the exact coordination patterns AuthContext
// relies on. They do NOT render or exercise the React AuthContext
// component — full component-level race tests need a DOM test runner,
// which is issue #12's job. The scenario tests below simulate
// AuthContext's control flow (capture ticket -> await -> check
// isCurrent before mutating a stand-in state object) with deferred
// promises, so the interleavings are the real ones even though the
// state object is a fake.
//
// Run with Node's built-in runner (no extra dependencies):
//   node --test src/context/authSession.test.js

import test from "node:test";
import assert from "node:assert/strict";

import { createAuthSessionGuard } from "./authSession.js";

// A promise whose resolution the test controls manually.
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

test("a ticket is current until a newer operation begins", () => {
    const guard = createAuthSessionGuard();

    const first = guard.begin();
    assert.equal(guard.isCurrent(first), true);

    const second = guard.begin();
    assert.equal(guard.isCurrent(first), false);
    assert.equal(guard.isCurrent(second), true);
});

test("invalidate() (logout) makes an in-flight ticket stale", () => {
    const guard = createAuthSessionGuard();

    const ticket = guard.begin();
    guard.invalidate();

    assert.equal(guard.isCurrent(ticket), false);
});

test("cleanup invalidation kills the old restore without touching a newer session", () => {
    const guard = createAuthSessionGuard();

    // First mount's restore captures its ticket, then the effect
    // cleanup runs (unmount / React Strict Mode remount).
    const restoreTicket = guard.begin();
    guard.invalidate();
    assert.equal(guard.isCurrent(restoreTicket), false);

    // A newer mount/operation captures a fresh ticket afterwards and
    // is completely unaffected by the earlier invalidation.
    const newerTicket = guard.begin();
    assert.equal(guard.isCurrent(newerTicket), true);
    assert.equal(guard.isCurrent(restoreTicket), false);
});

test("register -> login coordination: sharing one ticket does not self-invalidate", async () => {
    const guard = createAuthSessionGuard();

    // register() captures ONE ticket for the whole coordinated
    // operation, then hands the SAME ticket to its nested login step
    // instead of letting login call begin() again.
    const ticket = guard.begin();

    const registerRequest = deferred();
    const registerStage = (async () => {
        await registerRequest.promise;
        // After the register await, the shared ticket must still be
        // current — the nested login stage has not invalidated it.
        assert.equal(guard.isCurrent(ticket), true);
        return "registered";
    })();

    registerRequest.resolve();
    assert.equal(await registerStage, "registered");

    // Nested login stage runs under the same ticket to completion.
    const loginRequest = deferred();
    const loginStage = (async () => {
        await loginRequest.promise;
        return guard.isCurrent(ticket) ? "applied" : "ignored";
    })();

    loginRequest.resolve();
    assert.equal(await loginStage, "applied");
});

test("register -> login coordination: an external logout still invalidates the shared ticket", async () => {
    const guard = createAuthSessionGuard();

    const ticket = guard.begin(); // register starts, one shared ticket
    const loginRequest = deferred();

    const loginStage = (async () => {
        await loginRequest.promise;
        return guard.isCurrent(ticket) ? "applied" : "ignored";
    })();

    guard.invalidate(); // user logs out while the nested login is in flight
    loginRequest.resolve();

    assert.equal(await loginStage, "ignored");
});

test("scenario: a restore resolving after logout cannot resurrect the session", async () => {
    const guard = createAuthSessionGuard();
    const state = { user: null }; // stand-in for AuthContext state

    const restoreTicket = guard.begin();
    const profileRequest = deferred();

    const restore = (async () => {
        const profile = await profileRequest.promise;
        if (!guard.isCurrent(restoreTicket)) return; // stale: touch nothing
        state.user = profile;
    })();

    guard.invalidate(); // logout while the profile request is in flight
    profileRequest.resolve({ id: 1, email: "old@example.com" });
    await restore;

    assert.equal(state.user, null);
});

test("scenario: a restore failing after a newer login cannot clear the new session", async () => {
    const guard = createAuthSessionGuard();
    const state = { user: null, token: null };

    const restoreTicket = guard.begin();
    const profileRequest = deferred();

    const restore = (async () => {
        try {
            await profileRequest.promise;
        } catch {
            if (!guard.isCurrent(restoreTicket)) return; // stale failure: clear nothing
            state.user = null;
            state.token = null;
        }
    })();

    // Newer login completes and owns the session.
    const loginTicket = guard.begin();
    assert.equal(guard.isCurrent(loginTicket), true);
    state.user = { id: 2, email: "new@example.com" };
    state.token = "new-token";

    // The older restore now fails; its catch block must not wipe the
    // newer session the way AuthContext's unconditional catch did.
    profileRequest.reject(new Error("expired token"));
    await restore;

    assert.deepEqual(state.user, { id: 2, email: "new@example.com" });
    assert.equal(state.token, "new-token");
});

test("scenario: a login superseded during its profile fetch never applies its profile", async () => {
    const guard = createAuthSessionGuard();
    const state = { user: null };

    const loginTicket = guard.begin();
    const profileRequest = deferred();

    const login = (async () => {
        const profile = await profileRequest.promise;
        if (!guard.isCurrent(loginTicket)) return null; // superseded
        state.user = profile;
        return profile;
    })();

    guard.invalidate(); // logout during the profile fetch
    profileRequest.resolve({ id: 1, email: "stale@example.com" });

    assert.equal(await login, null); // superseded operations resolve to null
    assert.equal(state.user, null);
});
