require("./config/env").loadEnvironment();

const { hasDistinctStrongSecrets } = require("./utils/secretStrength");

// Refuse to start unless both values use acceptable 32-byte encodings and
// are distinct. Encoding cannot prove random generation; that needs private
// operator evidence. The message never names or reveals either value.
if (!hasDistinctStrongSecrets(process.env.JWT_SECRET, process.env.RATE_LIMIT_KEY_SECRET)) {
    console.error("Server configuration error: required server configuration is missing.");
    process.exit(1);
}

const app = require("./app");

// Use the configured port, or 5000 when none is supplied.
const PORT = process.env.PORT || 5000;

app.listen(PORT, ...(process.env.GNOSIS_LOCAL_DEV === "1" ? ["127.0.0.1"] : []), () => {
    console.log(`Server running on port ${PORT}`);
});
