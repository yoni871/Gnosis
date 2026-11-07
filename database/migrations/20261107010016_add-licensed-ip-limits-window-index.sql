-- Up Migration

-- Perf audit 2026-11-06: checkIpLimit deletes stale visitor-hour rows
-- (window_hour < NOW() - INTERVAL '2 hours') at the start of every
-- uncached licensed fetch, and seq-scanned licensed_ip_limits to do
-- it (8.8 ms cold / 7.1 ms warm at 6,668 rows). The PK
-- (key_hash, window_hour) cannot serve a window_hour-only range.
-- Measured with the index: 0.06 ms.
CREATE INDEX licensed_ip_limits_window_hour_idx
    ON licensed_ip_limits (window_hour);

-- Down Migration

DROP INDEX IF EXISTS licensed_ip_limits_window_hour_idx;
