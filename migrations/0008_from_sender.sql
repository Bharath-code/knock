-- Kept after knocks are purged, so "% of doors made by former senders" stays countable.
ALTER TABLE doors ADD COLUMN from_sender INTEGER NOT NULL DEFAULT 0;
