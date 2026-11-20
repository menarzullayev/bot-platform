export interface Stmt {
  bind(...values: unknown[]): Stmt;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface Db {
  prepare(sql: string): Stmt;
}

export interface BotRow {
  id: string;
  token_enc: string;
  secret: string;
  bot_info: string;
  template: string;
  config: string;
  enabled: number;
  created_at: number;
}

export function getBot(db: Db, id: string): Promise<BotRow | null> {
  return db
    .prepare("SELECT id, token_enc, secret, bot_info, template, config, enabled, created_at FROM bots WHERE id = ?")
    .bind(id)
    .first<BotRow>();
}

export async function insertBot(db: Db, row: BotRow): Promise<void> {
  await db
    .prepare(
      "INSERT INTO bots (id, token_enc, secret, bot_info, template, config, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(row.id, row.token_enc, row.secret, row.bot_info, row.template, row.config, row.enabled, row.created_at)
    .run();
}

export async function listBots(db: Db): Promise<Pick<BotRow, "id" | "template" | "enabled" | "created_at">[]> {
  const r = await db.prepare("SELECT id, template, enabled, created_at FROM bots ORDER BY created_at").all<
    Pick<BotRow, "id" | "template" | "enabled" | "created_at">
  >();
  return r.results;
}

export async function touchUser(db: Db, botId: string, userId: number, now: number): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO bot_users (bot_id, user_id, first_seen) VALUES (?, ?, ?)")
    .bind(botId, userId, now)
    .run();
}
