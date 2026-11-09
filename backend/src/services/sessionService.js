const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/db');
const ACCESS_SECONDS = 15 * 60;
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE = 'gnosisRefresh';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fresh = () => crypto.randomBytes(32).toString('hex');
const valid = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function accessToken(session) {
    return jwt.sign({ userId: session.user_id, sid: session.id }, process.env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: ACCESS_SECONDS, issuer: 'gnosis', audience: 'gnosis-api' });
}
async function transaction(work) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally { client.release(); }
}
async function createSession(userId, verifiedPasswordHash) {
    const session = { id: crypto.randomUUID(), user_id: userId };
    const token = accessToken(session);
    const refresh = fresh();
    const created = await transaction(async client => {
        // Reset locks this same user row before changing the password and
        // revoking sessions. Recheck the credential that login verified after
        // acquiring the lock; never issue from a stale password snapshot.
        const result = await client.query(
            'SELECT password_hash FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (typeof verifiedPasswordHash !== 'string'
            || result.rows[0]?.password_hash !== verifiedPasswordHash) return false;
        await client.query('INSERT INTO auth_sessions(id, user_id, expires_at) VALUES ($1, $2, $3)',
            [session.id, userId, new Date(Date.now() + SESSION_MS)]);
        await client.query('INSERT INTO auth_refresh_tokens(token_hash, session_id) VALUES ($1, $2)', [hash(refresh), session.id]);
        return true;
    });
    return created ? { token, refresh } : null;
}
async function rotateSession(refresh) {
    if (!valid(refresh)) return null;
    return transaction(async client => {
        // Lock the family first. A concurrent rotation rechecks used_at after waiting.
        const result = await client.query(`SELECT s.* FROM auth_sessions s
            JOIN auth_refresh_tokens t ON t.session_id = s.id WHERE t.token_hash = $1 FOR UPDATE OF s`, [hash(refresh)]);
        const session = result.rows[0];
        if (!session || session.revoked_at || new Date(session.expires_at) <= new Date()) return null;
        const current = await client.query('SELECT used_at FROM auth_refresh_tokens WHERE token_hash = $1', [hash(refresh)]);
        if (!current.rows[0] || current.rows[0].used_at) {
            await client.query('UPDATE auth_sessions SET revoked_at = now() WHERE id = $1', [session.id]);
            return null;
        }
        const token = accessToken(session);
        const replacement = fresh();
        await client.query('UPDATE auth_refresh_tokens SET used_at = now() WHERE token_hash = $1', [hash(refresh)]);
        await client.query('INSERT INTO auth_refresh_tokens(token_hash, session_id) VALUES ($1, $2)', [hash(replacement), session.id]);
        return { token, refresh: replacement, expiresAt: session.expires_at };
    });
}
async function revokeRefresh(refresh) {
    if (valid(refresh)) await pool.query(`UPDATE auth_sessions SET revoked_at = now()
        WHERE id = (SELECT session_id FROM auth_refresh_tokens WHERE token_hash = $1)`, [hash(refresh)]);
}
async function revokeAccess(header) {
    const match = /^Bearer ([^ ]+)$/.exec(header || '');
    if (!match) return;
    let claims;
    try {
        // An expired, signed credential may revoke its session, never authorize work.
        claims = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'],
            issuer: 'gnosis', audience: 'gnosis-api', ignoreExpiration: true });
    } catch { return; }
    if (!Number.isInteger(claims.userId) || typeof claims.sid !== 'string'
        || !/^[a-f0-9-]{36}$/.test(claims.sid)) return;
    await pool.query('UPDATE auth_sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2', [claims.sid, claims.userId]);
}
function readCookie(req) {
    const cookies = (req.headers.cookie || '').split(';').map(part => part.trim());
    const matches = cookies.filter(part => part.startsWith(`${COOKIE}=`));
    return matches.length === 1 ? matches[0].slice(COOKIE.length + 1) : null;
}
function setCookie(res, refresh, expiresAt = new Date(Date.now() + SESSION_MS)) {
    res.cookie(COOKIE, refresh, { httpOnly: true, secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict', path: '/api/auth', expires: new Date(expiresAt) });
}
function clearCookie(res) {
    res.clearCookie(COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/api/auth' });
}
// Session/device management (T2.5): the session rows carry no device
// metadata (no user agent, no IP is recorded), so the list identifies a
// session only by when it was created and when it expires. Never return
// token material: refresh-token hashes live in auth_refresh_tokens and
// are never selected here. Revoked sessions older than 30 days are
// excluded so the list does not accumulate indefinitely; a recently
// revoked session stays visible so the user can see what they revoked.
async function listSessions(userId) {
    const result = await pool.query(`SELECT id, created_at, expires_at, revoked_at FROM auth_sessions
        WHERE user_id = $1 AND (revoked_at IS NULL OR revoked_at > now() - interval '30 days')
        ORDER BY created_at DESC`, [userId]);
    return result.rows;
}
// Revoke one session, owned by this user only. Returns true when a live
// session was revoked; false when the id does not exist, is already
// revoked, or belongs to another user — all three share the same
// outcome, so the caller answers 404 without leaking which case hit.
async function revokeSession(userId, sessionId) {
    const result = await pool.query(`UPDATE auth_sessions SET revoked_at = now()
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id`, [sessionId, userId]);
    return result.rows.length > 0;
}
// Authenticated password change. Mirrors the reset flow's guarantees
// without logging the user out of the device they changed from: the
// password hash is updated and every OTHER session is revoked, so a
// stolen session on another device dies with the old password while
// the current session keeps working.
//
// Lock order matches createSession: verify the current password and
// hash the new one before any lock, then recheck the stored hash after
// locking the user row, so a concurrent reset (or another change) that
// lands first makes this one fail instead of resurrecting a stale hash.
// Returns 'ok' or 'invalid' (wrong current password, or the stored hash
// changed between verification and locking); database/bcrypt failures
// throw and become controlled 500s in the route.
async function changePassword(userId, currentPassword, newPassword, currentSessionId) {
    const row = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    const stored = row.rows[0]?.password_hash;
    if (typeof stored !== 'string') return 'invalid';
    if (!await bcrypt.compare(currentPassword, stored)) return 'invalid';
    // Cost matches register/reset at this base; the rebase onto PR #81
    // (secret-strength/passwords) raises new hashes to cost 12.
    const hashed = await bcrypt.hash(newPassword, 10);
    return transaction(async client => {
        const locked = await client.query(
            'SELECT password_hash FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (locked.rows[0]?.password_hash !== stored) return 'invalid';
        await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashed, userId]);
        await client.query(`UPDATE auth_sessions SET revoked_at = now()
            WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`, [userId, currentSessionId]);
        return 'ok';
    });
}
// Custom header requires a preflight; exact Origin checking also blocks sibling origins.
function browserSessionRequest(req, res, next) {
    const origin = req.headers.origin;
    if (req.headers['x-gnosis-session'] !== '1' || (origin && origin !== new URL(process.env.FRONTEND_URL).origin)) {
        return res.status(403).json({ error: 'Invalid session request.', code: 'SESSION_REQUEST_INVALID' });
    }
    next();
}
module.exports = { ACCESS_SECONDS, SESSION_MS, createSession, rotateSession, revokeRefresh,
    revokeAccess, readCookie, setCookie, clearCookie, browserSessionRequest, hash,
    listSessions, revokeSession, changePassword };
