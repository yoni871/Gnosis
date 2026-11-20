-- Up Migration
CREATE TABLE security_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind TEXT NOT NULL,
    user_id INTEGER NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX security_events_kind_created_at_idx ON security_events(kind, created_at);
CREATE INDEX security_events_user_id_created_at_idx ON security_events(user_id, created_at);
-- Down Migration
DROP TABLE security_events;
