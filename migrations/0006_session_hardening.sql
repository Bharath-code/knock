ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER;
ALTER TABLE sessions ADD COLUMN device TEXT;
UPDATE sessions SET last_seen_at = created_at;
