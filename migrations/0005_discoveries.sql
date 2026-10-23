CREATE TABLE discoveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spell_id TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id),
  display_name TEXT NOT NULL,   -- 發現當下的顯示名稱快照
  at INTEGER NOT NULL,
  first INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX discoveries_first ON discoveries(spell_id) WHERE first = 1;
CREATE INDEX discoveries_recent ON discoveries(id DESC);
