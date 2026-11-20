-- Calculator template: per-user settings, history, FX cache, Stars payments.
CREATE TABLE IF NOT EXISTS users (
  bot_id       TEXT NOT NULL,
  user_id      INTEGER NOT NULL,
  lang         TEXT,
  angle        TEXT NOT NULL DEFAULT 'deg',
  digits       INTEGER NOT NULL DEFAULT 12,
  pro_until    INTEGER NOT NULL DEFAULT 0,
  keep_history INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER,
  updated_at   INTEGER,
  PRIMARY KEY (bot_id, user_id)
);

CREATE TABLE IF NOT EXISTS history (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id  TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  expr    TEXT NOT NULL,
  result  TEXT NOT NULL,
  ts      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_user ON history (bot_id, user_id, id DESC);

CREATE TABLE IF NOT EXISTS fx_rates (
  base       TEXT NOT NULL,
  quote      TEXT NOT NULL,
  rate       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  source     TEXT,
  PRIMARY KEY (base, quote)
);

CREATE TABLE IF NOT EXISTS payments (
  charge_id  TEXT PRIMARY KEY,
  bot_id     TEXT NOT NULL,
  user_id    INTEGER NOT NULL,
  payload    TEXT,
  stars      INTEGER NOT NULL,
  kind       TEXT,
  period_end INTEGER,
  created_at INTEGER NOT NULL,
  refunded   INTEGER NOT NULL DEFAULT 0
);
