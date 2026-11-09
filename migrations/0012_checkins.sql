-- Day-7 "did it happen?" emails: one row per knock and side, holding the hash of that side's one-tap link.
CREATE TABLE checkins (
  knock_id TEXT NOT NULL REFERENCES knocks(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('sender', 'receiver')),
  token_hash TEXT NOT NULL UNIQUE,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (knock_id, side)
);
CREATE UNIQUE INDEX outcomes_reporter ON outcomes(knock_id, reported_by);
