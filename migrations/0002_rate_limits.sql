CREATE TABLE rate_limits (
  key TEXT NOT NULL,
  window INTEGER NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (key, window)
);
