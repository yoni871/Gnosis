// Operator alert report for roadmap T2.6 (suspicious-login + token-replay alerts).
//
// Reads the audit log (security_events) and prints recent
// refresh-token reuses and new-device logins. Detection + alert record
// only: this script never writes, never sends email, and never touches
// an auth flow. User notification emails are a separate PR's job.
//
// Usage (operator machine, read access to the App database):
//   GNOSIS_APP_DATABASE_URL=postgresql://... node scripts/security-alerts.js [--hours N] [--since <ISO date>] [--json]
//
//   --hours N    look back N hours (default 24)
//   --since ISO  look back from an ISO timestamp instead (overrides --hours)
//   --json       print machine-readable JSON instead of the text report
//
// Exit code: 1 when at least one `refresh_token.reused` event falls in
// the window — a replay means a consumed refresh token was presented
// again, so the session family was already revoked when the event was
// recorded and the account needs operator review. 0 when no reuse is
// found. New-device events are listed for review but never change the
// exit code: a new device is expected whenever a user signs in from a
// new phone, browser, or network.
//
// There is no acknowledgement store in this PR: the window IS the
// acknowledgement mechanism. A reuse found today stays visible to
// tomorrow's run until the window moves past it (or the operator
// re-runs with a shorter --since). See docs/SecurityAlerts.md.

const { Client } = require("pg");
const {
    ALERT_WINDOW_MS,
    findRecentReuseAlerts,
    findRecentNewDeviceAlerts,
} = require("../src/utils/securityAlerts");

function parseArgs(argv) {
    const options = { hours: ALERT_WINDOW_MS / 3600000, since: undefined, json: false };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--json") {
            options.json = true;
        } else if (argv[i] === "--hours" && i + 1 < argv.length) {
            const hours = Number(argv[++i]);
            if (!Number.isFinite(hours) || hours <= 0) throw new Error("Invalid --hours value.");
            options.hours = hours;
        } else if (argv[i] === "--since" && i + 1 < argv.length) {
            const since = new Date(argv[++i]);
            if (Number.isNaN(since.getTime())) throw new Error("Invalid --since value.");
            options.since = since;
        } else {
            throw new Error(`Unknown argument: ${argv[i]}`);
        }
    }
    return options;
}

function formatRow(row) {
    const at = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
    return `  user_id=${row.user_id} at=${at}`;
}

function printText(since, reuse, newDevices) {
    console.log(`Security alerts since ${since.toISOString()}`);
    console.log(`refresh_token.reused: ${reuse.length} event(s)`);
    for (const row of reuse) console.log(formatRow(row));
    if (reuse.length === 0) console.log("  (none)");
    console.log(`login.new_device: ${newDevices.length} event(s)`);
    for (const row of newDevices) console.log(formatRow(row));
    if (newDevices.length === 0) console.log("  (none)");
    if (reuse.length > 0) {
        console.log("ALERT: refresh-token reuse found in window; review the affected account(s).");
    }
}

async function main(argv) {
    const options = parseArgs(argv);
    const connectionString = process.env.GNOSIS_APP_DATABASE_URL;
    if (!connectionString) {
        throw new Error("GNOSIS_APP_DATABASE_URL is required.");
    }
    const since = options.since || new Date(Date.now() - options.hours * 3600000);
    const client = new Client({ connectionString });
    try {
        await client.connect();
        const reuse = await findRecentReuseAlerts(client, { since });
        const newDevices = await findRecentNewDeviceAlerts(client, { since });
        if (options.json) {
            console.log(JSON.stringify({ since: since.toISOString(), reuse, newDevices }, null, 2));
        } else {
            printText(since, reuse, newDevices);
        }
        return reuse.length > 0 ? 1 : 0;
    } finally {
        await client.end().catch(() => {});
    }
}

if (require.main === module) {
    main(process.argv.slice(2)).then(
        (code) => { process.exitCode = code; },
        (error) => {
            // The connection string is never printed: it carries credentials.
            console.error(`security-alerts failed: ${error.message}`);
            process.exitCode = 2;
        }
    );
}

module.exports = { parseArgs, printText, formatRow };
