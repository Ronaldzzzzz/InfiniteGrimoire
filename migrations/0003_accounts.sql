-- v2 A: accounts. One session per device (replaces players.token_hash), username + password
-- credentials, and rate-limit logs for logins and guest creation.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  player_id    TEXT NOT NULL REFERENCES players(id),
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_player ON sessions (player_id);

-- existing guests keep their token
INSERT INTO sessions (token_hash, player_id, created_at, last_seen_at)
  SELECT token_hash, id, created_at, created_at FROM players;

-- drop players.token_hash (NOT NULL UNIQUE cannot be dropped in place): rebuild the table.
-- Copy aside, drop, then re-create `players` under its own name and insert the rows back: the
-- re-inserted parent rows clear the deferred foreign-key violations the DROP recorded for
-- saves/sessions (renaming a copy into place would not, and the commit would fail).
CREATE TABLE players_copy AS SELECT id, display_name, created_at, suspicious FROM players;
DROP TABLE players;
CREATE TABLE players (
  id           TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  suspicious   INTEGER NOT NULL DEFAULT 0
);
INSERT INTO players (id, display_name, created_at, suspicious)
  SELECT id, display_name, created_at, suspicious FROM players_copy;
DROP TABLE players_copy;

CREATE TABLE credentials (
  player_id     TEXT PRIMARY KEY REFERENCES players(id),
  username      TEXT NOT NULL,
  username_key  TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE login_failures (
  id  INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  at  INTEGER NOT NULL
);
CREATE INDEX idx_login_failures_key_at ON login_failures (key, at);

CREATE TABLE guest_creations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX idx_guest_creations_ip_at ON guest_creations (ip, at);
