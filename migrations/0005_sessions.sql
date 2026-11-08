CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_person ON sessions(person_id);

CREATE TABLE magic_links (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  person_id TEXT REFERENCES people(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX magic_links_expiry ON magic_links(expires_at);
