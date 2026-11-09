require("./config/env").loadEnvironment();

const app = require("./app");
const { requireStrongSecrets } = require("./utils/secretStrength");

// Refuse to start unless JWT_SECRET and RATE_LIMIT_KEY_SECRET are each
// at least 32 random bytes and differ from each other (audit N06; the
// JWT!=RATE_LIMIT rule is ported from #72). Presence alone is not
// enough: HS256 with a short or guessable secret is offline
// brute-forceable, and sharing one value across both uses would let a
// leak of one compromise the other. The message is deliberately
// generic: it must not reveal the secret or any other environment
// value. The auth middleware and the rate limiter keep their own
// runtime checks for the case where app.js is imported without going
// through this file.
try {
    requireStrongSecrets(process.env);
} catch {
    console.error("Server configuration error: required server configuration is missing.");
    process.exit(1);
}

// Use the configured port, or 5000 when none is supplied.
const PORT = process.env.PORT || 5000;

app.listen(PORT, ...(process.env.GNOSIS_LOCAL_DEV === "1" ? ["127.0.0.1"] : []), () => {
    console.log(`Server running on port ${PORT}`);
});
