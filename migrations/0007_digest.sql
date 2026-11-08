ALTER TABLE notification_prefs ADD COLUMN tz TEXT;
ALTER TABLE notification_prefs ADD COLUMN digest_checked_at INTEGER;
ALTER TABLE notification_prefs ADD COLUMN unsub_token TEXT;
CREATE UNIQUE INDEX notification_prefs_unsub ON notification_prefs(unsub_token);
