-- Anti-cheat anchor window: uploads are validated against the anchor state and the time since anchor_at.
ALTER TABLE saves ADD COLUMN anchor_state TEXT;
ALTER TABLE saves ADD COLUMN anchor_at INTEGER;
UPDATE saves SET anchor_state = state, anchor_at = saved_at WHERE anchor_state IS NULL;
