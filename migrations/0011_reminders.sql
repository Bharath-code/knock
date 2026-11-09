-- One reminder per Not now. knock_id is not a foreign key: the knock is purged on the same day the reminder is due.
CREATE TABLE reminders (
  knock_id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  door_id TEXT NOT NULL REFERENCES doors(id) ON DELETE CASCADE,
  remind_at INTEGER NOT NULL,
  sent_at INTEGER
);
CREATE INDEX reminders_due ON reminders(remind_at) WHERE sent_at IS NULL;
