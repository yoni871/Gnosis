// Breached-password screening via Have I Been Pwned k-anonymity
// (audit N07, roadmap T1.7). Free, no key required.
//
// Only the first 5 hex characters of the password's SHA-1 ever leave
// this process: the range API returns every suffix sharing that prefix
// (typically hundreds), and the match is done locally. The full
// password and the full hash never leave the server. SHA-1 is used here
// only as the lookup key the HIBP range API defines; it is not a
// password hash and no password is ever stored as SHA-1.
//
// Ordering: routes call this AFTER the rate limiter has reserved and
// BEFORE hashing, so a breached password never reaches bcrypt and the
// check cannot be used as a pre-rate-limit oracle. On registration the
// check runs before any database access, so an existing and a new
// address get the same response and no account state leaks. On reset
// it runs after the token is known valid, before hashing.
//
// Failure mode: FAIL OPEN. A network error, a 2-second timeout, or a
// non-2xx response allows the password and logs one warn line carrying
// no password data. Failing closed would block registration and
// password reset whenever HIBP is down or unreachable, which trades a
// screening control for an availability outage; the password still has
// to pass the length rule and bcrypt, and rate limiting still applies.
//
// Test seam, mirroring the Resend client: tests inject a fetch
// implementation (unit tests) or a loopback stub through the
// environment override (route and application tests).
// HIBP_API_BASE_URL is honored only when GNOSIS_TEST_ISOLATION=1;
// production ignores it even if it is set, so no test ever calls the
// real HIBP API.

const crypto = require("node:crypto");

const HIBP_API_BASE_URL_DEFAULT = "https://api.pwnedpasswords.com/range/";
const HIBP_PREFIX_LENGTH = 5;
const HIBP_TIMEOUT_MS = 2000;

// Pure resolution, unit-testable without a network call. Injected base
// URLs (tests) win; otherwise the environment override applies only
// under test isolation; otherwise the HIBP range API is used.
function resolveHibpBaseUrl({ injectedBaseUrl, env = process.env } = {}) {
    if (typeof injectedBaseUrl === "string" && injectedBaseUrl.length > 0) {
        return injectedBaseUrl;
    }
    if (env.GNOSIS_TEST_ISOLATION === "1"
        && typeof env.HIBP_API_BASE_URL === "string"
        && env.HIBP_API_BASE_URL.length > 0) {
        return env.HIBP_API_BASE_URL;
    }
    return HIBP_API_BASE_URL_DEFAULT;
}

async function isBreachedPassword(password, { fetchImpl = globalThis.fetch, baseUrl: injectedBaseUrl, env = process.env } = {}) {
    const sha1 = crypto.createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
    const prefix = sha1.slice(0, HIBP_PREFIX_LENGTH);
    const suffix = sha1.slice(HIBP_PREFIX_LENGTH);
    const baseUrl = resolveHibpBaseUrl({ injectedBaseUrl, env });
    // The default base ends in "/", but an injected or overridden base
    // may not; normalize so the range path is always appended cleanly.
    const rangeUrl = baseUrl.endsWith("/") ? baseUrl + prefix : `${baseUrl}/${prefix}`;
    try {
        const response = await fetchImpl(rangeUrl, {
            signal: AbortSignal.timeout(HIBP_TIMEOUT_MS),
            headers: { "User-Agent": "Gnosis" },
        });
        if (!response.ok) {
            console.warn("[auth] breached-password check unavailable; allowing password");
            return false;
        }
        const body = await response.text();
        for (const line of body.split("\n")) {
            const candidate = line.trim().split(":")[0];
            if (candidate && candidate.toUpperCase() === suffix) {
                return true;
            }
        }
        return false;
    } catch {
        // Fail open (see header): a down or unreachable HIBP must not
        // block registration or password reset. The warn line carries no
        // password data.
        console.warn("[auth] breached-password check unavailable; allowing password");
        return false;
    }
}

module.exports = {
    isBreachedPassword,
    resolveHibpBaseUrl,
    HIBP_API_BASE_URL_DEFAULT,
    HIBP_PREFIX_LENGTH,
    HIBP_TIMEOUT_MS,
};
