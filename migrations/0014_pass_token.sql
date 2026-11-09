-- Pass to a better door: the sender's one-tap confirm link is stored only as a hash, like checkins.
ALTER TABLE passes ADD COLUMN token_hash TEXT;
ALTER TABLE passes ADD COLUMN by_name TEXT;
CREATE UNIQUE INDEX passes_token ON passes(token_hash);
