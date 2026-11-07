# Run Gnosis locally on macOS

Use Node 22.x (tested with 22.14.0), npm, Git, and Docker Desktop with Compose.
Start Docker Desktop before provisioning. No Vercel CLI, account, deployment,
production secrets, database dump, or email account is needed for reader review.

From the repository root:

```sh
npm ci --prefix backend
npm ci --prefix frontend
npm ci --prefix tools/bible-import --ignore-scripts
npm run local:setup --prefix backend
docker compose --env-file backend/.env.local -f compose.local.yaml up -d --wait
npm run local:prepare --prefix backend
npm run dev --prefix backend
```

In a second terminal:

```sh
cd ~/Documents/Bible_Commentary_App
npm run dev --prefix frontend
```

Open **http://localhost:5173**. Use `localhost` consistently in the browser;
`127.0.0.1` is a different origin for sessions. The backend is on port 5000;
Vite forwards `/api` there. Both ports must be free (macOS AirPlay Receiver can
occupy 5000; disable it in System Settings if needed). Keep PORT=5000 unless you
also update the Vite proxy. Vite refuses to silently switch away from 5173.
The development frontend always uses `/api`, ignoring stale VITE_API_URL values.

## Private configuration and database isolation

`local:setup` creates backend/.env.local exclusively, mode 0600, with independent
random JWT, rate-limit, operator and runtime passwords. It never reads or changes
an existing backend/.env or .env.local. Examples contain variable names and safe
values only. Do not commit environment files or paste credentials into a terminal.
`npm run dev` explicitly uses .env.local, skips .env, and binds the backend to
loopback. It refuses DATABASE_URL, non-loopback hosts and any DB_NAME other than
gnosis_local. Shell variables still take precedence, so unset inherited
DATABASE_URL or conflicting DB_*/MIGRATION_DB_* settings. Do not set test-isolation
flags in application environments.

Compose creates a separate PostgreSQL 14 instance, bound to 127.0.0.1:55432,
with its own volume. It never uses an existing PostgreSQL server on 5432.
`local:prepare` requires matching operator/runtime host, port and database and
fixed local role names. It uses the official migrations with explicit local
target, seeds all 66 books, BSB/KJV/ASV from reviewed repository workbooks and
Wesley's commentary from repository JSON. Runtime uses a separate role with
reference-data SELECT and only the auth/private-data grants it needs. The
operator is never used by the HTTP app. No account or verified user is seeded.

For later schema changes, rerun `npm run local:prepare --prefix backend`.
It applies pending migrations and skips translations with existing verses;
commentary entries use conflict protection. It does not overwrite existing data.
For the manual migration CLI, see Database_Migrations.md: it reads backend/.env,
not this profile's .env.local. Do not point that file at production for local work.
Do not execute database/schema.sql as an installation script.

Stop the database without deleting data:

```sh
docker compose --env-file backend/.env.local -f compose.local.yaml stop
```

Keep .env.local with the volume: changing the operator password in the file does
not change a previously initialized PostgreSQL password. Do not delete a volume
to troubleshoot without first deciding whether its local data should be retained.

## Authentication and email

Required startup settings are JWT_SECRET, RATE_LIMIT_KEY_SECRET, FRONTEND_URL,
valid TRUST_PROXY if supplied, and database configuration. Default local
EMAIL_DELIVERY=disabled needs no RESEND_API_KEY or EMAIL_FROM. Email attempts fail
closed without any network call, logging a safe provider-failure category only.
Public reading and commentary work; registrations remain unverified, receive no
login session, and cannot log in. No verification token/link is printed or exposed.

To exercise full registration/login manually, privately set EMAIL_DELIVERY=resend,
a valid RESEND_API_KEY and verified EMAIL_FROM in .env.local. Keep
FRONTEND_URL=http://localhost:5173. Follow the delivered verification link, verify,
then sign in. Otherwise the existing disposable database email/session integration
tests exercise verification with a loopback delivery stub; no real email is needed.
Do not manually mark application users verified or disable authentication.

HTTP is permitted only for loopback frontend origins under the explicit local
profile. Production still requires HTTPS FRONTEND_URL, valid email sender and
Resend key, NODE_ENV=production and both secrets. Production ignores local delivery
exceptions. JWT expiry, database session checks, refresh rotation, replay detection,
revocation, exact Origin checks and X-Gnosis-Session remain unchanged. Refresh
cookies are HttpOnly, SameSite=Strict and Secure in production; local HTTP cookies
omit Secure, have no Domain and remain scoped to /api/auth. Never expose this
local profile to the LAN/internet. See Sessions.md for the production proxy.

Licensed ESV/NIV/NLT/NKJV/NASB require their own provider keys/IDs (listed in
.env.example and LicensedTranslations.md); unconfigured providers are hidden.
Bundled BSB/KJV/ASV require no keys and no outbound Scripture requests.

## Verify and troubleshoot

```sh
npm run local:check --prefix backend
curl --fail http://localhost:5173/api/books
curl --fail http://localhost:5173/api/books/1/chapters
curl --fail http://localhost:5173/api/translations
curl --fail http://localhost:5173/api/commentaries
curl --fail http://localhost:5173/api/bible/Genesis/1/BSB
curl --fail 'http://localhost:5173/api/books/1/chapters/1/commentaries?commentaryId=1'
npm test --prefix backend
npm test --prefix frontend
npm run build:check --prefix frontend
npm run test:database --prefix backend -- 14
```

In the browser select books/chapters, translations and Wesley commentary. Check
DevTools Network for successful local /api responses. With configured email, test
verification, login, reload/refresh, private notes and logout; wrong Origin or
missing X-Gnosis-Session must still reject session requests.

- `ECONNREFUSED`: the proxy cannot reach the backend; inspect backend startup
  first, ensure port 5000 is listening, then check local PostgreSQL health.
- Generic server configuration error: `cd backend && npm run config:check`
  diagnoses the legacy .env using field names only, never values or a connection.
  The original failure here was missing RATE_LIMIT_KEY_SECRET, not email. An env
  variable count is not validation. JWT_SECRET was absent from the old example.
- HTTP FRONTEND_URL rejected: use the explicit `npm run dev` local profile;
  ordinary/production startup intentionally still requires HTTPS.
- Login/session 403: FRONTEND_URL must match http://localhost:5173 exactly. A Vercel
  origin does not match the local browser. Use the same-origin Vite proxy.
- Empty books/404 chapter: migrations provide schema, not Bible content; install
  tools/bible-import dependencies and run local:prepare.
- Missing relation auth_sessions/auth_refresh_tokens: apply latest migrations.
  Latest main adds these session tables and requires runtime grants.
- Docker connection error: start Docker Desktop. Port 55432 conflict: stop only
  the conflicting local service; never redirect this setup to a hosted database.
- Local preparation failure: verify Docker health, generated credentials, and
  importer dependencies. Credentials/raw database errors are deliberately omitted.
- Existing password mismatch: preserve the original .env.local used for that local
  volume; do not overwrite credentials or run migrations against a different DB.

Vercel deploymentEnabled already disables automatic deployments for fix branches.
Open PRs to main; do not merge or push main/production merely to review the UI.

## Verification for this fix

On November 7, 2026: backend 173/173, frontend 294/294 and isolated production
build passed. A fresh PostgreSQL 14 cluster in a temporary directory was used
because Docker Desktop's daemon was stopped. Official migrations, generated local
credentials, restricted runtime grants, full BSB/KJV/ASV and Wesley seed, both dev
servers and the real Vite proxy were exercised. All local:check routes returned
nonempty data; the protected profile returned 401; no Vite proxy connection errors
were recorded. A second preparation skipped existing Scripture. All 33 existing
real-database application integration tests passed, including verification with a
loopback email stub, session rotation/replay/revocation/expiry and rate limits.
Real email delivery and manual browser interactions were not exercised. The
Docker Compose startup path and PostgreSQL 18 were not run on this machine.
