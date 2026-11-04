-- Up Migration

-- Issue #4: authentication rate limiting. One row per counted attempt,
-- keyed by an HMAC hash (never a raw IP address or email address). A row
-- counts only while it is inside its policy window; the sweep deletes
-- rows older than the longest window (60 minutes).
CREATE TABLE rate_limit_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash BYTEA NOT NULL,
    policy TEXT NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX rate_limit_attempts_count_idx
    ON rate_limit_attempts (key_hash, policy, attempted_at);

CREATE INDEX rate_limit_attempts_sweep_idx
    ON rate_limit_attempts (attempted_at);

-- Issue #4: shared sweep state. Exactly one row (id = 1) records when the
-- last sweep ran, so many instances coordinate on one global interval.
-- The application role gets SELECT and UPDATE on this table only; the
-- row itself is created here, never by the application.
CREATE TABLE rate_limit_sweep_state (
    id SMALLINT PRIMARY KEY,
    last_swept_at TIMESTAMPTZ NOT NULL
);

INSERT INTO rate_limit_sweep_state (id, last_swept_at)
VALUES (1, '1970-01-01 00:00:00+00')
ON CONFLICT DO NOTHING;

-- Down Migration

DROP TABLE IF EXISTS rate_limit_sweep_state;
DROP TABLE IF EXISTS rate_limit_attempts;
