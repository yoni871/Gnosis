// Password hashing for registration, login, and password reset.
//
// Argon2id is the OWASP first choice (RFC 9106) and hashes every new
// password. Existing bcrypt hashes keep verifying until the account's
// next successful login, which transparently migrates them (see the
// login handler in routes/authRoutes.js): verify the bcrypt hash, issue
// the session, then compare-and-swap the stored hash to Argon2id.
// No mass re-hash is ever needed, and a bcrypt hash is never rejected
// just for being old.
//
// The dummy hash below is a public, non-secret constant: it is the
// value verified against when no account exists for the submitted
// email, so unknown-email logins cost the same password-hash work as
// known-account logins. It is an Argon2id hash (same parameters as a
// real account) rather than the old bcrypt dummy, so that once every
// account has migrated, unknown and known logins take the same time.
// During the transition a known bcrypt account verifies slower than
// the dummy (bcrypt cost 10 measured ~290 ms vs Argon2id ~45 ms on
// this hardware); that is a transient, rate-limited timing signal that
// disappears as accounts migrate, and it is strictly better than the
// reverse (a bcrypt dummy would diverge from known Argon2id accounts
// forever). The plaintext behind the dummy is irrelevant — it is
// never a real credential — and the hash was generated once with the
// parameters below and pasted in, exactly like the bcrypt dummy before
// it.

const argon2 = require("argon2");
const bcrypt = require("bcrypt");

// OWASP Password Storage Cheat Sheet minimums for Argon2id:
// m=19 MiB (19456 KiB), t=2 iterations, p=1 lane. Keep the parameters
// in this one named constant so they are easy to tune later; the
// encoded hash carries them, so verify needs no copy of them.
const ARGON2_OPTIONS = Object.freeze({
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
});

// Public dummy value, never an account credential. Generated once with
// hashPassword("gnosis-unknown-account-dummy") and pasted in.
const UNKNOWN_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$Z6cmDlfqhYA6io47LJLtdQ$k20vhuQ9wz5kbI/i+sx6tNwi+zySZO82AUmcDjQZuxQ";

const ARGON2ID_PREFIX = "$argon2id$";
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$/;

function isArgon2idHash(value) {
    return typeof value === "string" && value.startsWith(ARGON2ID_PREFIX);
}

function isBcryptHash(value) {
    return typeof value === "string" && BCRYPT_PATTERN.test(value);
}

async function hashPassword(password) {
    return argon2.hash(password, ARGON2_OPTIONS);
}

// Verify a password against a stored hash in either format. A stored
// value in neither format fails closed (false) instead of throwing: it
// is not a password the account can ever present, so it behaves exactly
// like a wrong password. A malformed Argon2id value throws (argon2.verify
// rejects it) and callers turn that into a controlled 500, the same
// treatment a corrupt hash got before this migration; a malformed bcrypt
// value simply returns false from bcrypt.compare and fails as a wrong
// password. Either way nothing sensitive leaks.
async function verifyPassword(password, storedHash) {
    if (isArgon2idHash(storedHash)) {
        return argon2.verify(storedHash, password);
    }
    if (isBcryptHash(storedHash)) {
        return bcrypt.compare(password, storedHash);
    }
    return false;
}

module.exports = {
    ARGON2_OPTIONS,
    UNKNOWN_PASSWORD_HASH,
    hashPassword,
    verifyPassword,
    isArgon2idHash,
    isBcryptHash,
};
