CREATE TABLE players (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  suspicious INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE saves (
  player_id TEXT PRIMARY KEY REFERENCES players(id),
  state TEXT NOT NULL,
  revision INTEGER NOT NULL,
  saved_at INTEGER NOT NULL,
  prev_state TEXT,
  prev_saved_at INTEGER
);

CREATE TABLE rejections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  reasons TEXT NOT NULL
);
CREATE INDEX idx_rejections_player_at ON rejections (player_id, at);

CREATE TABLE synth_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  combo TEXT NOT NULL,
  result TEXT NOT NULL
);
