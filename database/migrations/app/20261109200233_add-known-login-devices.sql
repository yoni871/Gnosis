-- Up Migration
CREATE TABLE known_login_devices (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL,
    device_key BYTEA NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, device_key)
);
CREATE INDEX known_login_devices_user_id_idx ON known_login_devices(user_id);
-- Down Migration
DROP TABLE known_login_devices;
