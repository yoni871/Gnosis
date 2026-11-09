# Query-budget follow-up to PR #77

Stacked on Muse 1's database hardening branch. No database schema, live database,
Neon/Vercel setting, deployment, shared PostgreSQL service or soak state changes.

Runtime pools default to a 5s server statement timeout, 1s lock timeout, 5s idle
transaction timeout, 6s client query wait and five connections. Configuration is
strictly bounded: statement/idle transaction 100–30000ms, lock 50–5000ms and
strictly shorter than statement, and pool size 1–10. Zero/unlimited and malformed
values fail startup. DB_STATEMENT_TIMEOUT_MS, DB_LOCK_TIMEOUT_MS,
DB_IDLE_TRANSACTION_TIMEOUT_MS and DB_POOL_MAX are the optional overrides.
Client query timeout alone is not treated as server cancellation.

Connection URLs are parsed once before applying policy. This closes the pg
configuration-precedence gap in #77: `sslmode`/libpq-compat URL options must not
replace enforced certificate AND hostname verification. URL/ambient startup
options cannot override the resource limits. Pool-idle errors log only a safe
SQLSTATE and fixed operation, never diagnostics, URLs, private values or stacks.

Tests assert the effective pg Client configuration, not only Pool.options.
Disposable PostgreSQL tests exercise actual statement cancellation, lock timeout,
idle-transaction termination and connection recovery. The migration and complete
application suite can run against an owned, fresh native cluster with:

```
npm run test:database --prefix backend -- 14 --native /usr/local/opt/postgresql@14/bin
```

This path never reads an application URL or existing PGDATA, starts only a fresh
cluster on an ephemeral loopback port, and stops/removes only that cluster.
Docker/CI modes and their explicit target restrictions remain unchanged.

Direct PostgreSQL tests do not establish that a hosted transaction pooler honors
startup GUCs. Verify rejection/cancellation and query latency in an approved
preview before release. No preview probes or setting changes were made here.

Sources: [pg SSL precedence](https://node-postgres.com/features/ssl),
[pg timeout parameters](https://node-postgres.com/apis/client).
