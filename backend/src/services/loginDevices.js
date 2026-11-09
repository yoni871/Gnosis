// Lightweight new-device/IP detection for roadmap T2.6.
//
// On a successful login, the login route calls recordLoginDevice() with
// the request's IP and user-agent. If this user has never logged in
// from that combination before, the device is recorded and the audit
// event `login.new_device` is emitted (see docs/SecurityEvents.md);
// if it has been seen, only its last_seen_at is refreshed and nothing
// is emitted. The login is never blocked or challenged here: step-up
// MFA is DEFERRED until Muse 3's TOTP work lands, and a new device
// alone is not proof of compromise.
//
// What is stored: one row per (user, device) in known_login_devices.
// The device key is an HMAC-SHA256 of the IP + user-agent under the
// dedicated RATE_LIMIT_KEY_SECRET, using the same length-prefixed
// encoding as backend/src/utils/rateLimit.js (computeKeyHash with the
// "known_login_device" policy namespace), so the stored value is
// neither a raw IP nor a raw user-agent, and never a plain hash (which
// is dictionary reversible). No IP, user-agent, email, password, or
// token is ever stored by this module. A device key cannot be reversed
// into an IP or user-agent without the secret, and the secret is never
// read from anywhere except process.env at call time.
//
// Failure discipline: best-effort, always. A missing secret, a
// database failure, or a missing client address is logged as one safe
// line (code only, never a message, stack, or request value) and the
// login keeps its original 200 response. Detection must never break
// login.

const { audit } = require("../utils/auditLog");
const { computeKeyHash, getRateLimitSecret } = require("../utils/rateLimit");

const DEVICE_KEY_POLICY = "known_login_device";

// The HMAC input. `ip` and `userAgent` are strings; an absent
// user-agent is the empty string (a client that sends none still gets
// a stable key for its IP). Exported for unit tests, which pin the
// key against rateLimit.computeKeyHash directly.
function computeDeviceKey(ip, userAgent, secret) {
    return computeKeyHash(DEVICE_KEY_POLICY, [ip, userAgent], secret);
}

// Record this login's device for the user. Returns { isNew: true }
// when the device was unseen (and `login.new_device` was emitted),
// { isNew: false } when it was already known, or when detection was
// skipped or failed. NEVER throws and NEVER changes the login outcome.
async function recordLoginDevice(db, userId, ip, userAgent) {
    try {
        if (!Number.isInteger(userId)) return { isNew: false };
        // Without a client address there is nothing to key a device on;
        // skip silently rather than collapsing every address-less login
        // into one shared device.
        if (typeof ip !== "string" || ip === "") return { isNew: false };
        const secret = getRateLimitSecret();
        const deviceKey = computeDeviceKey(ip, typeof userAgent === "string" ? userAgent : "", secret);
        // Insert-first, so concurrent first logins from the same new
        // device cannot double-emit: exactly the inserter sees a row
        // and audits; the loser refreshes last_seen_at instead.
        const inserted = await db.query(
            `INSERT INTO known_login_devices(user_id, device_key)
             VALUES ($1, $2)
             ON CONFLICT (user_id, device_key) DO NOTHING RETURNING id`,
            [userId, deviceKey]
        );
        if (inserted.rows.length === 1) {
            // Best-effort, after the device row committed. audit()
            // never throws, so a failed insert cannot change the 200.
            await audit(db, "login.new_device", userId);
            return { isNew: true };
        }
        await db.query(
            `UPDATE known_login_devices SET last_seen_at = now()
             WHERE user_id = $1 AND device_key = $2`,
            [userId, deviceKey]
        );
        return { isNew: false };
    } catch (error) {
        const code = error && typeof error.code === "string" ? error.code : "none";
        console.error(`[login-devices] record failed code=${code}`);
        return { isNew: false };
    }
}

module.exports = { DEVICE_KEY_POLICY, computeDeviceKey, recordLoginDevice };
