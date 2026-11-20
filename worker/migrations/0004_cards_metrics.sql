-- P5 (DEC-014, DEC-015): share-card images and aggregated daily counters.
-- cards: PNG drawn by the Mini App canvas (<= 64 KB), served at /card/<id>.png, purged by the hourly cron after 72 h.
CREATE TABLE IF NOT EXISTS cards (
  id         TEXT PRIMARY KEY,
  bot_id     TEXT NOT NULL,
  user_id    INTEGER NOT NULL,
  png        BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_created ON cards (created_at);

-- metrics_daily: anonymous counters only (day UTC, bot, key, n). No user ids, no text, no per-user keys.
-- WITHOUT ROWID: one B-tree instead of two, i.e. fewer rows written per upsert.
CREATE TABLE IF NOT EXISTS metrics_daily (
  day    TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  key    TEXT NOT NULL,
  n      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, bot_id, key)
) WITHOUT ROWID;
