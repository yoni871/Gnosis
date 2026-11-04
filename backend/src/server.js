require("./config/env").loadEnvironment();

const app = require("./app");

// Refuse to start without a JWT secret. The message is deliberately
// generic: it must not reveal the secret or any other environment value.
// The auth middleware keeps its own runtime check for the case where
// app.js is imported without going through this file.
if (!process.env.JWT_SECRET) {
    console.error("Server configuration error: required server configuration is missing.");
    process.exit(1);
}

// Issue #4: refuse to start without a rate-limit key secret, for the same
// reason. The rate limiter keeps its own runtime check for the case where
// app.js is imported without going through this file.
if (!process.env.RATE_LIMIT_KEY_SECRET) {
    console.error("Server configuration error: required server configuration is missing.");
    process.exit(1);
}

// Use the configured port, or 5000 when none is supplied.
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
