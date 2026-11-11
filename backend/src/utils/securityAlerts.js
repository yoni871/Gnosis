// Suspicious-login + token-replay alerts for roadmap T2.6.
//
// The alert source of truth is the audit log (security_events, T1.16):
// refresh-token reuse is already recorded there as `refresh_token.reused`
// by sessionService.rotateSession, and first logins from an unseen
// device as `login.new_device` by services/loginDevices.js. These
// queries only READ that table; they never write, never send email,
// and never change an auth response. User notification emails are a
// separate PR's job (roadmap PR3); this module is detection + alert
// record only.
//
// Alert rule: ONE `refresh_token.reused` event is an alert by itself.
// A replay means a consumed refresh token was presented again, which
// only happens if the token leaked or was stolen — and the session
// family was already revoked when the event was recorded. There is no
// count threshold to tune: any reuse inside the window is reported.
// `login.new_device` events are listed for operator review but are NOT
// alerts on their own: a new device is expected whenever a user signs
// in from a new phone, browser, or network.
//
// Acknowledgement semantics: there is no acknowledgement store in this
// PR. The window IS the acknowledgement mechanism — the operator
// script exits non-zero while any reuse event falls inside its window
// (default 24h), and exits zero once the window moves past it or the
// operator re-runs with a shorter --since. A future operator step can
// add an explicit acknowledgement table; until then, a reuse found
// today stays visible to tomorrow's run.

const REUSE_ALERT_KIND = "refresh_token.reused";
const NEW_DEVICE_KIND = "login.new_device";

// Default lookback for the operator script: one day of reuse history.
const ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;

function windowStart(since) {
    if (since instanceof Date && !Number.isNaN(since.getTime())) return since;
    return new Date(Date.now() - ALERT_WINDOW_MS);
}

function validateDb(db) {
    if (!db || typeof db.query !== "function") {
        throw new TypeError("securityAlerts requires a database with query().");
    }
}

async function findEvents(db, kind, since) {
    validateDb(db);
    const result = await db.query(
        `SELECT user_id, created_at FROM security_events
         WHERE kind = $1 AND created_at >= $2 ORDER BY created_at DESC`,
        [kind, windowStart(since)]
    );
    return result.rows;
}

// Every refresh-token reuse in the window, newest first. Each row is
// { user_id, created_at }. An empty array means no replay was seen.
async function findRecentReuseAlerts(db, { since } = {}) {
    return findEvents(db, REUSE_ALERT_KIND, since);
}

// Every first-login-from-a-new-device in the window, newest first.
// Same row shape. Listed for review; not an alert by itself.
async function findRecentNewDeviceAlerts(db, { since } = {}) {
    return findEvents(db, NEW_DEVICE_KIND, since);
}

module.exports = {
    ALERT_WINDOW_MS,
    REUSE_ALERT_KIND,
    NEW_DEVICE_KIND,
    findRecentReuseAlerts,
    findRecentNewDeviceAlerts,
};
