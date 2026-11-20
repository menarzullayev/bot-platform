CREATE TABLE IF NOT EXISTS bots (
  id         TEXT PRIMARY KEY,
  token_enc  TEXT NOT NULL,
  secret     TEXT NOT NULL,
  bot_info   TEXT NOT NULL,
  template   TEXT NOT NULL,
  config     TEXT NOT NULL DEFAULT '{}',
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bot_users (
  bot_id     TEXT NOT NULL,
  user_id    INTEGER NOT NULL,
  first_seen INTEGER NOT NULL,
  PRIMARY KEY (bot_id, user_id)
);
