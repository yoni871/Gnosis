// Purge expired auth artefacts: verification tokens, password-reset
// tokens, sessions, and refresh tokens.
//
// Usage (operator-run, from the repo root or the backend directory):
//   DATABASE_URL=<owner connection string> node backend/scripts/purge-expired.js
// Run it with the OWNER (neondb_owner) connection string, never the
// application role's: the runtime role deliberately holds no DELETE
// grant on these tables, so the script fails closed under the app
// credentials. It reads the same database configuration as the
// application (DATABASE_URL / GNOSIS_APP_DATABASE_URL, or the local
// DB_* settings from backend/.env). It never sends email and never
// touches user data rows (notes, bookmarks, highlights, reading state).
//
// What it deletes, and why each predicate is safe:
// - email_verification_tokens where expires_at < now(): only expired
//   rows. Consumed-but-unexpired rows are kept on purpose: the verify
//   endpoint answers an already-verified link with success while the
//   row is still inside its TTL, so deleting it early would break a
//   double-clicked verification link.
// - password_reset_tokens where expired OR consumed (used/superseded):
//   a replayed reset link gets the same generic 400 whether its row
//   exists or not, so consumed rows carry no signal worth keeping.
// - auth_refresh_tokens whose session is revoked or expired, then
//   auth_sessions that are revoked or expired. Used-but-live refresh
//   tokens are kept on purpose: rotation detects a replayed token by
//   finding its used_at row and revoking the whole session family, so
//   deleting those rows would weaken replay detection.
//
// The script is idempotent and safe to run while the app is live: every
// DELETE only matches already-dead rows, takes row locks only, and a
// re-run finds nothing left to delete. It is meant to be run by an
// operator on a regular cadence (weekly is enough at current scale);
// no cron, hook, or scheduled job is set up by this script. Only
// per-table counts are logged, never user data.
//
// Exit code 0 on success, 1 on failure.

async function purgeExpired(pool) {
    const counts = {};

    const verification = await pool.query(
        "DELETE FROM email_verification_tokens WHERE expires_at < now()"
    );
    counts.email_verification_tokens = verification.rowCount;

    const reset = await pool.query(
        `DELETE FROM password_reset_tokens
         WHERE expires_at < now() OR consumed_reason IS NOT NULL`
    );
    counts.password_reset_tokens = reset.rowCount;

    const refresh = await pool.query(
        `DELETE FROM auth_refresh_tokens
         WHERE session_id IN (
             SELECT id FROM auth_sessions
             WHERE revoked_at IS NOT NULL OR expires_at < now()
         )`
    );
    counts.auth_refresh_tokens = refresh.rowCount;

    const sessions = await pool.query(
        "DELETE FROM auth_sessions WHERE revoked_at IS NOT NULL OR expires_at < now()"
    );
    counts.auth_sessions = sessions.rowCount;

    return counts;
}

async function main() {
    require("../src/config/env").loadEnvironment({ quiet: true });
    const pool = require("../src/db/db");
    try {
        const counts = await purgeExpired(pool);
        const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
        console.log(
            `Purged ${total} expired auth rows: ` +
            Object.entries(counts).map(([table, n]) => `${table}=${n}`).join(", ")
        );
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`Expired-auth purge failed: ${error.code || "unknown error"}`);
        process.exitCode = 1;
    });
}

module.exports = { purgeExpired };
