ALTER TABLE people ADD COLUMN handle TEXT;
ALTER TABLE people ADD COLUMN owner_token_hash TEXT;
CREATE UNIQUE INDEX people_handle ON people(handle);
