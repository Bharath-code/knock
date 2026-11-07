ALTER TABLE codes ADD COLUMN code_hash TEXT;
CREATE UNIQUE INDEX codes_dedupe ON codes(door_id, code_hash);
