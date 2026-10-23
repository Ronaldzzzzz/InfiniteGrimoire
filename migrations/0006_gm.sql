ALTER TABLE players ADD COLUMN gm_used INTEGER NOT NULL DEFAULT 0;

CREATE TABLE gm_tokens (
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  expires_at INTEGER NOT NULL
);

CREATE TABLE gm_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gm_player_id TEXT NOT NULL REFERENCES players(id),
  at INTEGER NOT NULL,
  action TEXT NOT NULL,      -- 'login' | 'inventory' | 'unlock_zones' | 'reveal_all' | 'boss_ready' | 'reset_password'
  target TEXT,               -- 被重設密碼的帳號名稱；其他動作為 NULL
  detail TEXT                -- JSON，例如改了哪些道具；絕不含密碼或雜湊
);
