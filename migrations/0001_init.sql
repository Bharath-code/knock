CREATE TABLE orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at INTEGER NOT NULL
);

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  email_hash TEXT NOT NULL UNIQUE,
  display_name TEXT,
  x_handle TEXT,
  links_json TEXT,
  profile_json TEXT,
  verified_github TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL UNIQUE REFERENCES people(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at INTEGER NOT NULL
);
CREATE INDEX users_org ON users(org_id);

CREATE TABLE doors (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL,
  template TEXT NOT NULL,
  post_text TEXT,
  post_url TEXT,
  fields_json TEXT NOT NULL,
  yes_action_json TEXT,
  window_days INTEGER NOT NULL DEFAULT 7 CHECK (window_days IN (3, 7, 14)),
  status TEXT NOT NULL DEFAULT 'open',
  badge_optin INTEGER NOT NULL DEFAULT 0,
  listed_optin INTEGER NOT NULL DEFAULT 0,
  created_from_knock_id TEXT REFERENCES knocks(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  closed_at INTEGER,
  UNIQUE (owner_user_id, slug)
);
CREATE INDEX doors_org ON doors(org_id);
CREATE INDEX doors_from_knock ON doors(created_from_knock_id);

CREATE TABLE knocks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  door_id TEXT NOT NULL REFERENCES doors(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  answers_json TEXT NOT NULL,
  proof_url TEXT,
  check_before INTEGER,
  check_after INTEGER,
  used_rewrite INTEGER NOT NULL DEFAULT 0,
  fit INTEGER CHECK (fit BETWEEN 1 AND 5),
  spam INTEGER NOT NULL DEFAULT 0,
  bucket TEXT,
  evidence_json TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  token_hash TEXT NOT NULL UNIQUE,
  consent_at INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('reply', 'bio', 'form', 'agent', 'pass', 'list')),
  passed_from_knock_id TEXT REFERENCES knocks(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  seen_at INTEGER,
  answered_at INTEGER,
  expires_at INTEGER NOT NULL,
  UNIQUE (door_id, person_id)
);
CREATE INDEX knocks_inbox ON knocks(door_id, status, fit DESC, created_at);
CREATE INDEX knocks_org ON knocks(org_id);
CREATE INDEX knocks_person ON knocks(person_id);
CREATE INDEX knocks_expiry ON knocks(status, expires_at);

CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  knock_id TEXT NOT NULL REFERENCES knocks(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  answer TEXT NOT NULL CHECK (answer IN ('yes', 'later', 'no', 'pass', 'expired')),
  reason_code TEXT,
  note TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX decisions_knock ON decisions(knock_id);

CREATE TABLE passes (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  from_knock_id TEXT NOT NULL REFERENCES knocks(id) ON DELETE CASCADE,
  from_door_id TEXT NOT NULL REFERENCES doors(id) ON DELETE CASCADE,
  to_door_id TEXT NOT NULL REFERENCES doors(id) ON DELETE CASCADE,
  note TEXT,
  sender_consent_at INTEGER,
  new_knock_id TEXT REFERENCES knocks(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at INTEGER NOT NULL
);
CREATE INDEX passes_from_knock ON passes(from_knock_id);
CREATE INDEX passes_to_door ON passes(to_door_id);

CREATE TABLE codes (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  door_id TEXT NOT NULL REFERENCES doors(id) ON DELETE CASCADE,
  code_enc TEXT NOT NULL,
  knock_id TEXT UNIQUE REFERENCES knocks(id) ON DELETE SET NULL,
  assigned_at INTEGER
);
CREATE INDEX codes_free ON codes(door_id, assigned_at);

CREATE TABLE outcomes (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  knock_id TEXT NOT NULL REFERENCES knocks(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('referred', 'interview', 'tried', 'hired', 'connected', 'none')),
  reported_by TEXT NOT NULL,
  confirmed_by_both INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL
);
CREATE INDEX outcomes_knock ON outcomes(knock_id);

CREATE TABLE door_stats (
  door_id TEXT PRIMARY KEY REFERENCES doors(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  knocks_total INTEGER NOT NULL DEFAULT 0,
  answered_in_window INTEGER NOT NULL DEFAULT 0,
  answer_rate_90d REAL,
  median_answer_hours REAL,
  outcomes_total INTEGER NOT NULL DEFAULT 0,
  passes_out INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE person_stats (
  person_id TEXT PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
  knocks_sent INTEGER NOT NULL DEFAULT 0,
  distinct_receivers INTEGER NOT NULL DEFAULT 0,
  answered INTEGER NOT NULL DEFAULT 0,
  yes_count INTEGER NOT NULL DEFAULT 0,
  outcomes_count INTEGER NOT NULL DEFAULT 0,
  spam_reports INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE form_connections (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  door_id TEXT NOT NULL REFERENCES doors(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('tally', 'typeform')),
  secret_hash TEXT NOT NULL,
  field_map_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX form_connections_door ON form_connections(door_id);

CREATE TABLE notification_prefs (
  person_id TEXT PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
  seen_alerts INTEGER NOT NULL DEFAULT 1,
  digests INTEGER NOT NULL DEFAULT 1,
  unsubscribed_at INTEGER
);

CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES people(id) ON DELETE CASCADE,
  tag TEXT NOT NULL CHECK (tag IN ('bug', 'request', 'confusion')),
  body TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX feedback_person ON feedback(person_id);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX audit_log_org ON audit_log(org_id, at);
