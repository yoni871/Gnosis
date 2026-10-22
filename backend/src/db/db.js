const { Pool } = require("pg");
require("dotenv").config();

// Production uses one connection URL.
// Local development keeps using the existing DB_* settings.
const config = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL
    }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT
    };

// Each backend instance maintains a small pool of reusable connections.
const pool = new Pool({
    ...config,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000
});

// Handle errors from connections that are sitting idle.
pool.on("error", (error) => {
    console.error("Unexpected database connection error:", error.message);
});

module.exports = pool;