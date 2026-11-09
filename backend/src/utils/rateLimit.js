// Authentication rate limiting for issue #4.
//
// A reusable, database-backed sliding-window limiter. Counting lives in
// PostgreSQL (never in process memory), so every backend instance shares
// the same buckets and a distributed burst is still counted exactly once.
//
// Design, as approved:
// - Policies: fixed limits per window, counted per HMAC key. Unknown-email
//   and wrong-password failures count; validation failures and internal
//   (database/bcrypt/JWT) failures do not; successes do not count and do
//   not reset prior failures (only window expiry clears a bucket).
// - Keys: HMAC-SHA256 with a dedicated RATE_LIMIT_KEY_SECRET, never a raw
//   IP or email address and never a plain hash (which is dictionary
//   reversible). Inputs use an unambiguous length-prefixed encoding, not
//   delimiter joins, so different field splits can never collide.
// - Reservations: a short transaction takes a per-key advisory lock,
//   inserts a provisional row, counts, and commits or rolls back. The lock
//   is never held across bcrypt, database, or network work, and the
//   provisional row counts while the attempt is in flight, so a burst is
//   strict: exactly N of M concurrent attempts pass.
// - After the attempt, a counted failure keeps its row; a success or an
//   internal error deletes it. A crash leaves at most in-flight phantom
//   rows, which expire with the window.
// - Fail closed: any store failure, missing secret, or undeterminable
//   client address is a generic 500, never a bypass.
// - Cleanup: the portable in-response approach. A bounded sweep runs
//   before the response is returned, gated by a per-instance throttle, a
//   non-blocking advisory try-lock (exactly one instance sweeps), and a
//   shared sweep-state row enforcing the global interval. Sweep failure
//   rolls back only the sweep, never active counters, and never affects
//   the response.
// - This module delivers the policy engine and middleware factory.
//   Issue #9 adds its own policies below through the same factory.

const crypto = require("node:crypto");
const pool = require("../db/db");
const { internalErrorBody, logAuthFailure } = require("./authErrors");

// Approved policies. Windows are milliseconds; limits are counted
// failures per window. No email-only pre-auth limit exists on purpose:
// one would let anyone lock out any account by email alone.
const POLICIES = {
    // Count both successful rotation and invalid/replayed credentials. A
    // refresh flood must not grow token families without spending a budget.
    refresh_family: { windowMs: 60 * 1000, limit: 30 },
    refresh_ip: { windowMs: 60 * 1000, limit: 120 },
    refresh_token: { windowMs: 60 * 1000, limit: 10 },
    login_ip_email: { windowMs: 15 * 60 * 1000, limit: 5 },
    login_ip: { windowMs: 15 * 60 * 1000, limit: 30 },
    register_ip: { windowMs: 60 * 60 * 1000, limit: 5 },
    // Issue #9: resend and verify limits. Resend counts every
    // structurally valid request (unknown, verified, and unverified
    // alike) because the limiter runs before any account lookup; the
    // verify limit counts every structurally valid token attempt.
    resend_ip_email: { windowMs: 60 * 60 * 1000, limit: 5 },
    resend_ip: { windowMs: 60 * 60 * 1000, limit: 20 },
    verify_ip: { windowMs: 15 * 60 * 1000, limit: 30 },
    // Issue #10: forgot-password mirrors resend (an email-sending
    // endpoint that must not leak account state), and reset-password
    // mirrors verify (a token-guessing endpoint). Forgot counts every
    // structurally valid request because the limiter runs before any
    // account lookup; reset counts every structurally valid token
    // attempt.
    forgot_ip_email: { windowMs: 60 * 60 * 1000, limit: 5 },
    forgot_ip: { windowMs: 60 * 60 * 1000, limit: 20 },
    reset_ip: { windowMs: 15 * 60 * 1000, limit: 30 },
};

// The longest window above. The sweep deletes rows older than this, since
// no policy can count them anymore.
const LONGEST_WINDOW_MS = 60 * 60 * 1000;

// Cleanup gates: at most one sweep attempt per instance per minute, at
// most one sweep globally per minute, at most this many expired rows per
// sweep. Storage can still grow during an extreme distributed attack (one
// row per distinct attacker key per window is inherent to counting);
// edge-level protection or Redis may eventually be necessary.
const CLEANUP_MIN_INTERVAL_MS = 60 * 1000;
const SWEEP_BATCH_LIMIT = 1000;

// Generic 429 body, identical regardless of policy or account: the client
// learns nothing about which limit fired or whether an account exists.
const RATE_LIMITED_BODY = {
    error: "Too many attempts. Please try again later.",
    code: "RATE_LIMITED",
};

// The sweep lock is a fixed advisory-lock key pair in its own namespace.
// Per-key locks use (hash(policy), hash(key)); the sweep pair is derived
// from a different namespace string, so it cannot be a real bucket key.
const SWEEP_LOCK_PAIR = [hashText32("gnosis_rate_limit_sweep"), hashText32("sweep")];

// Per-instance throttle state: the last time this process attempted a
// sweep. Shared state in PostgreSQL enforces the global interval.
let lastCleanupAttemptMs = 0;

// The secret is read at request time (not import time) so a missing secret
// is a controlled 500 through the middleware, mirroring the JWT secret's
// defensive runtime check in the auth middleware.
function getRateLimitSecret() {
    const secret = process.env.RATE_LIMIT_KEY_SECRET;
    if (!secret) {
        throw new Error("Rate limit configuration is missing.");
    }
    return secret;
}

// Length-prefixed encoding: each value contributes its byte length (4
// bytes, big-endian) followed by its bytes. Unlike delimiter joins, this
// cannot confuse ("ab", "c") with ("a", "bc").
function computeKeyHash(policy, fields, secret) {
    if (typeof policy !== "string" || !Array.isArray(fields) ||
        fields.some((field) => typeof field !== "string")) {
        throw new Error("Rate limit key fields must be strings.");
    }
    const parts = [];
    for (const value of [policy, ...fields]) {
        const bytes = Buffer.from(value, "utf8");
        const length = Buffer.alloc(4);
        length.writeUInt32BE(bytes.length, 0);
        parts.push(length, bytes);
    }
    return crypto.createHmac("sha256", secret).update(Buffer.concat(parts)).digest();
}

// Deterministic 32-bit string hash, used ONLY to derive advisory-lock
// keys from the policy name and key hex. It carries no security property:
// the bucket identity itself is the HMAC above.
function hashText32(value) {
    let hash = 5381;
    for (let i = 0; i < value.length; i++) {
        hash = (Math.imul(33, hash) + value.charCodeAt(i)) | 0;
    }
    return hash;
}

function lockKeyPair(policy, keyHash) {
    return [hashText32(policy), hashText32(keyHash.toString("hex"))];
}

// One reservation attempt for one policy: lock, insert, count, commit or
// roll back, all inside one short transaction on one checked-out client.
// Returns { allowed: true, reservation } or { allowed: false, retryAfter }
// where retryAfter is whole seconds until the oldest counted attempt
// leaves the window, so a 429 never extends its own window.
async function attemptReservation(dbPool, policyName, keyHash) {
    const policy = POLICIES[policyName];
    if (!policy) {
        throw new Error("Unknown rate limit policy.");
    }
    const client = await dbPool.connect();
    try {
        await client.query("BEGIN");
        try {
            const [key1, key2] = lockKeyPair(policyName, keyHash);
            await client.query("SELECT pg_advisory_xact_lock($1, $2)", [key1, key2]);
            const inserted = await client.query(
                "INSERT INTO rate_limit_attempts(key_hash, policy) VALUES ($1, $2) RETURNING id",
                [keyHash, policyName],
            );
            const counted = await client.query(
                `SELECT COUNT(*)::int AS count, MIN(attempted_at) AS oldest
                 FROM rate_limit_attempts
                 WHERE key_hash = $1 AND policy = $2
                   AND attempted_at > now() - ($3 * INTERVAL '1 millisecond')`,
                [keyHash, policyName, policy.windowMs],
            );
            const { count, oldest } = counted.rows[0];
            if (count > policy.limit) {
                await client.query("ROLLBACK");
                const retryAfter = Math.max(1, Math.ceil(
                    (new Date(oldest).getTime() + policy.windowMs - Date.now()) / 1000,
                ));
                return { allowed: false, retryAfter };
            }
            await client.query("COMMIT");
            return { allowed: true, reservation: { id: inserted.rows[0].id } };
        } catch (error) {
            try {
                await client.query("ROLLBACK");
            } catch {
                // The rollback itself failed; the client is released below
                // and PostgreSQL rolls back the aborted transaction.
            }
            throw error;
        }
    } finally {
        client.release();
    }
}

// Best-effort release: a failed delete leaves the row to expire with its
// window, which is the safe default.
async function releaseReservations(dbPool, reservations) {
    for (const reservation of reservations) {
        try {
            await dbPool.query("DELETE FROM rate_limit_attempts WHERE id = $1", [reservation.id]);
        } catch {
            // Expires with the window; never affects the response.
        }
    }
}

// Bounded in-response sweep. Never throws: any failure returns a skipped
// result and leaves counters untouched. The throttle timestamp advances
// even on failure, so a down store is not hammered once per request.
async function maybeCleanup(dbPool, options = {}) {
    const now = options.now ?? Date.now();
    if (now - lastCleanupAttemptMs < CLEANUP_MIN_INTERVAL_MS) {
        return { skipped: "throttle" };
    }
    lastCleanupAttemptMs = now;
    let client;
    try {
        client = await dbPool.connect();
        await client.query("BEGIN");
        try {
            const locked = await client.query(
                "SELECT pg_try_advisory_xact_lock($1, $2) AS locked", SWEEP_LOCK_PAIR,
            );
            if (!locked.rows[0].locked) {
                await client.query("ROLLBACK");
                return { skipped: "lock" };
            }
            const state = await client.query(
                "SELECT last_swept_at FROM rate_limit_sweep_state WHERE id = 1 FOR UPDATE",
            );
            if (state.rows.length === 0) {
                await client.query("ROLLBACK");
                return { skipped: "no-state" };
            }
            const lastSwept = new Date(state.rows[0].last_swept_at).getTime();
            if (now - lastSwept < CLEANUP_MIN_INTERVAL_MS) {
                await client.query("ROLLBACK");
                return { skipped: "interval" };
            }
            const cutoff = new Date(now - LONGEST_WINDOW_MS);
            const deleted = await client.query(
                `DELETE FROM rate_limit_attempts WHERE id IN (
                     SELECT id FROM rate_limit_attempts
                     WHERE attempted_at < $1 ORDER BY attempted_at LIMIT $2
                 )`,
                [cutoff, SWEEP_BATCH_LIMIT],
            );
            await client.query(
                "UPDATE rate_limit_sweep_state SET last_swept_at = $1 WHERE id = 1",
                [new Date(now)],
            );
            await client.query("COMMIT");
            return { swept: deleted.rowCount };
        } catch {
            try {
                await client.query("ROLLBACK");
            } catch {
                // Aborted transaction rolls back on release.
            }
            return { skipped: "error" };
        }
    } catch {
        return { skipped: "error" };
    } finally {
        if (client) {
            client.release();
        }
    }
}

// Middleware factory. policySpecs is an ordered list of
// { policy, fields } where fields(req, ip) returns the key fields for
// that policy. Every policy is attempted even after one blocks, so the
// 429's Retry-After is the maximum remaining wait across all blocking
// policies. Reservations from allowed policies are released when any
// policy blocks, so a 429 never consumes quota. Cleanup runs in-response before
// the 429 or before the handler, never after the response.
function createRateLimitMiddleware(policySpecs, endpoint) {
    return async (req, res, next) => {
        const reservations = [];
        try {
            const secret = getRateLimitSecret();
            const ip = req.ip;
            if (!ip) {
                throw new Error("Client address is unavailable.");
            }
            const blockedWaits = [];
            for (const spec of policySpecs) {
                const keyHash = computeKeyHash(spec.policy, spec.fields(req, ip), secret);
                const outcome = await attemptReservation(pool, spec.policy, keyHash);
                if (!outcome.allowed) {
                    blockedWaits.push(outcome.retryAfter);
                } else {
                    reservations.push(outcome.reservation);
                }
            }
            if (blockedWaits.length > 0) {
                // Every policy is attempted even after one blocks, so the
                // header is the maximum remaining wait across all blocking
                // policies, as documented. A blocked policy's reservation
                // was already rolled back; allowed ones are released here,
                // so a blocked request consumes or extends no quota.
                await releaseReservations(pool, reservations);
                await maybeCleanup(pool);
                return res.status(429)
                    .set("Retry-After", String(Math.max(...blockedWaits)))
                    .json(RATE_LIMITED_BODY);
            }
            const state = { reservations, finalized: false };
            req.rateLimit = {
                isFinalized: () => state.finalized,
                finalize: async (kind) => {
                    if (state.finalized) {
                        return;
                    }
                    state.finalized = true;
                    if (kind === "release") {
                        await releaseReservations(pool, state.reservations);
                    }
                },
            };
            await maybeCleanup(pool);
            return next();
        } catch (error) {
            await releaseReservations(pool, reservations);
            logAuthFailure(`POST /api/auth/${endpoint}`, "rate-limit", error);
            return res.status(500).json(internalErrorBody(endpoint));
        }
    };
}

// Trust-proxy parsing (integration of #72 over main #71).
// - "true" is REJECTED (ported from #72): trusting every proxy hop lets
//   any client spoof X-Forwarded-For and defeat per-IP rate limiting
//   (verified live on Preview, where TRUST_PROXY was "true").
// - A hop count ("1", "3") is ACCEPTED: #72's hop-count rejection is
//   REJECTED by the integration disposition. The hop-count model is the
//   staged fix per Muse 1 (explicit hop count or edge CIDRs, never
//   "true"), and is PROVISIONAL — the hop-count-vs-edge-CIDRs choice is
//   an OWNER CALL for Yonatan. If he picks edge CIDRs, this branch stays
//   valid anyway (CIDR entries are accepted below).
// - Otherwise: false for unset/"0"/"false", else a comma-separated list
//   of IPs, CIDRs, or Express subnet names (loopback, linklocal,
//   uniquelocal). Anything else fails fast at startup, so a typo can
//   never silently become a spoofable configuration.
function resolveTrustProxy(value) {
    if (value === undefined || value === "") {
        return false;
    }
    if (value === "0" || value === "false") {
        return false;
    }
    if (value === "true") {
        throw new Error("Invalid trust proxy configuration.");
    }
    if (/^\d+$/.test(value) && Number.isSafeInteger(Number(value))) {
        return Number(value);
    }
    const rawParts = value.split(",");
    if (rawParts.some((part) => part.trim() === "")) {
        throw new Error("Invalid trust proxy configuration.");
    }
    const parts = rawParts.map((part) => part.trim());
    if (parts.length > 0 && parts.every(isTrustedProxyEntry)) {
        return parts.length === 1 ? parts[0] : parts;
    }
    throw new Error("Invalid trust proxy configuration.");
}

function isTrustedProxyEntry(entry) {
    if (entry === "loopback" || entry === "linklocal" || entry === "uniquelocal") {
        return true;
    }
    const [address, prefix] = entry.split("/");
    if (prefix !== undefined && !/^\d+$/.test(prefix)) {
        return false;
    }
    if (address.includes(":")) {
        if (!/^[0-9a-fA-F:]+$/.test(address)) {
            return false;
        }
        return prefix === undefined || (Number(prefix) >= 0 && Number(prefix) <= 128);
    }
    const octets = address.split(".");
    if (octets.length !== 4) {
        return false;
    }
    if (!octets.every((octet) => /^\d+$/.test(octet) && Number(octet) <= 255)) {
        return false;
    }
    return prefix === undefined || (Number(prefix) >= 0 && Number(prefix) <= 32);
}

module.exports = {
    POLICIES,
    LONGEST_WINDOW_MS,
    CLEANUP_MIN_INTERVAL_MS,
    SWEEP_BATCH_LIMIT,
    RATE_LIMITED_BODY,
    getRateLimitSecret,
    computeKeyHash,
    attemptReservation,
    releaseReservations,
    maybeCleanup,
    createRateLimitMiddleware,
    resolveTrustProxy,
};
