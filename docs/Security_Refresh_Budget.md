# Distributed refresh-token request budgets

Stacked on #72. No session model/schema or live database changes. Rotation,
absolute expiry, replay revocation, cookie security and exact-origin checks stay
in place. Muse 2's soak and all deployment settings are untouched.

`POST /api/auth/refresh` validates the browser session request and one correctly
formatted cookie before database work. Missing, duplicate and malformed cookies
return an uncached generic 401 without limiter/session queries. Structurally
valid requests reserve shared PostgreSQL-backed HMAC buckets: 120/socket-client
IP/minute and 10/presented token/minute. Raw credentials and IPs are not stored.
A stable family bucket additionally caps issuance at 30/minute across rotated
credentials and IPs. It is reserved under the existing session-row lock in the
rotation transaction, before consuming the old cookie or issuing a new token.
Family throttling preserves that cookie for retry and does not extend its own
window; it still spends the outer request budget to prevent free lookup floods.
Both successful rotation and invalid/replayed tokens count; internal failures
release reservations and fail closed. A later-policy store failure also releases
an earlier reservation. Uncached 429s include Retry-After. Existing sweep cleanup
remains bounded and applies its one-hour maximum retention to all attempt rows.

Tests cover invalid input, blocked/outage paths before rotation, success counting,
internal release, real replay behavior, expiry and two independent backend
instances sharing a strict concurrent budget. Spoofed forwarding addresses are
included in the real HTTP/PostgreSQL burst fixture.

As in #72, the actual ingress topology must be verified before deployment.
Proxied users currently share a socket-IP bucket; this is a conservative safety
tradeoff and must not be worked around with blanket or numeric-hop trust.
Distributed attackers across many addresses still need edge-level protection.
