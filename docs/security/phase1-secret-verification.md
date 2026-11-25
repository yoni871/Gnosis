# Phase 1 item #6 — JWT and rate-limit secret verification

Assessment date: 2026-11-25. **Verdict: BLOCKED for hosted verification.** This assessment uses source code and synthetic local tests only. No Vercel value was retrieved, printed, copied, compared, or rotated.

## Confirmed source findings and fix

Before this change, `isStrongSecret` accepted any 32-character string, including repeated characters and a human phrase. It also accepted repeated 64-character hex and 43-character base64url values. The boot check evaluated `JWT_SECRET` and `RATE_LIMIT_KEY_SECRET` separately, so identical values passed. Vercel can import `src/app.js` as the package entry point without running `src/server.js`; the pairwise boot check was not at that import boundary. These are configuration-validation weaknesses. A guessable JWT signing key permits token forgery if an attacker can derive it; reuse of the rate-limit key removes intended key separation. No hosted weak value or exploit was observed.

The focused fix accepts only canonical hex/base64url encodings that decode to at least 32 bytes, rejects obvious placeholders and low-variation/repeating decoded bytes, and requires the underlying JWT and rate-limit key **bytes** to differ even if encoded differently. The same generic failure is enforced at `server.js` startup and `app.js` import, without logging either value. `scripts/check-config.js` reports field names only. Local setup already calls `crypto.randomBytes(32)` separately for each value; documentation now calls for separate private generation.

**Limit of source verification:** encoding, byte count, variety and inequality do **not** prove 256 bits of generated randomness or independent generation. A deterministic 32-byte hash of a public phrase can pass. The required property is provenance from a cryptographically secure random generator, attested privately by the operator. The check deliberately does not claim entropy measurement.

## Local regression evidence

- `node --test test/auth/secretStrength.test.js test/auth/serverConfig.test.js test/config/checkConfig.test.js`: **26/26 passed**. Tests cover missing/short values, plain phrases, malformed encodings, repeated bytes, encoded placeholders, identical key bytes under different encodings, redacted errors, boot, and serverless app import.
- `npm test`: **455/455 passed** across the backend synthetic suite. CI must repeat this on the final PR head before merge.
- Synthetic test fixtures derive deterministic 64-hex strings from public labels at test runtime so they satisfy *format* validation without storing credential-looking literals. They are intentionally public test values and provide no evidence about hosted secret generation.

## Private Vercel operator attestation needed for PASS

For each active Preview and Production deployment, the authorized Vercel operator should record **only** the following non-secret facts in a protected evidence record:

1. Deployment/project identity and deployed commit SHA; `JWT_SECRET` and `RATE_LIMIT_KEY_SECRET` are present in the intended environment scope and are not inherited from a test/local scope.
2. Each value was generated independently by a CSPRNG with at least 32 bytes of fresh randomness, then encoded canonically; neither was derived from the other, a password, a repository example, a shared seed, or any other application key. Record generator method, generation/rotation date and operator, not the values.
3. The two current values are distinct, and the Preview values are separate from Production values. Perform comparisons inside the authorized secret manager; report booleans only.
4. The exact deployed revision passes the generic startup/import validation without logging values. If any value fails, stop and request a separate approved rotation plan. Rotating `JWT_SECRET` must be paired with session revocation under `docs/IncidentResponse.md`; rotating the rate-limit key resets active buckets.

No operator should paste values, hashes, lengths, connection details, or screenshots of secret fields into a PR or chat. A successful source test, a stored variable name, or a merged PR does not satisfy this attestation.

Muse should assign independent security and QA review to the final PR head, reconcile the private attestation without handling raw values in the PR, and keep item #6 **BLOCKED** until all four facts above are recorded for the active environments. Phase 1 remains FAIL.

**Merge/deployment gate:** because `main` deploys to Preview, the Vercel operator must privately confirm that the *current Preview values* satisfy the new encoding, variation and separation checks before this PR merges. If either value fails, stop the merge and obtain a separately approved rotation/session-revocation plan; this PR does not rotate or deploy secrets. Production format compatibility also requires attestation before any later promotion.
