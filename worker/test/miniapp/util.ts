import { createHmac } from "node:crypto";
import type { Db, Stmt } from "../../src/db";
import { encryptToken } from "../../src/crypto";
import type { Env } from "../../src/env";
import { TEST_KEY } from "../helpers";

export const BOT_ID = "tezcalc";
/** Not a real token: shaped like one so the log redaction regex would also catch it. */
export const BOT_TOKEN = "987654321:AAFakeTokenForTestsOnly_0123456789abcdefg";
export const NOW = 1_700_000_000;
export const ADMIN_TOKEN = "a".repeat(40);

export interface UserFields {
  id?: number;
  first_name?: string;
  language_code?: string;
  [k: string]: unknown;
}

/** Signs initData exactly as documented (independent of the production implementation, uses node:crypto). */
export function signInitData(token: string, fields: Record<string, string>): string {
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const dcs = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const hash = createHmac("sha256", secret).update(dcs).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

export function initDataFor(token: string, user: UserFields = {}, authDate = NOW, extra: Record<string, string> = {}): string {
  return signInitData(token, {
    auth_date: String(authDate),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify({ id: 4242, first_name: "Test", language_code: "en", ...user }),
    ...extra,
  });
}

interface UserRow {
  lang: string | null;
  angle: string;
  digits: number;
  keep_history: number;
  pro_until: number;
}
interface HistRow {
  id: number;
  bot_id: string;
  user_id: number;
  expr: string;
  result: string;
  ts: number;
}

/** In-memory stand-in for the handful of statements the Mini App API issues. */
export class AppDb implements Db {
  bots = new Map<string, Record<string, unknown>>();
  users = new Map<string, UserRow>();
  history: HistRow[] = [];
  fx: { base: string; quote: string; rate: string; updated_at: number; source: string | null }[] = [];
  private seq = 0;
  queries = 0;

  prepare(sql: string): Stmt {
    const self = this;
    let a: unknown[] = [];
    const stmt: Stmt = {
      bind(...v: unknown[]) {
        a = v;
        return stmt;
      },
      async first<T>() {
        self.queries++;
        if (sql.startsWith("SELECT id, token_enc")) return (self.bots.get(String(a[0])) as T) ?? null;
        if (sql.startsWith("SELECT lang, angle, digits, keep_history, pro_until FROM users")) {
          return (self.users.get(`${a[0]}:${a[1]}`) as T) ?? null;
        }
        throw new Error("AppDb.first unsupported: " + sql);
      },
      async all<T>() {
        self.queries++;
        if (sql.startsWith("SELECT base, quote, rate, updated_at, source FROM fx_rates")) return { results: self.fx as T[] };
        if (sql.startsWith("SELECT id, expr, result, ts FROM history")) {
          const [bot, user, limit] = a as [string, number, number];
          const rows = self.history
            .filter((h) => h.bot_id === bot && h.user_id === user)
            .sort((x, y) => y.id - x.id)
            .slice(0, limit)
            .map((h) => ({ id: h.id, expr: h.expr, result: h.result, ts: h.ts }));
          return { results: rows as T[] };
        }
        throw new Error("AppDb.all unsupported: " + sql);
      },
      async run() {
        self.queries++;
        if (sql.startsWith("INSERT INTO users")) {
          const [bot, user, lang, angle, digits, kh] = a as [string, number, string | null, string, number, number];
          const prev = self.users.get(`${bot}:${user}`);
          self.users.set(`${bot}:${user}`, { lang, angle, digits, keep_history: kh, pro_until: prev?.pro_until ?? 0 });
          return {};
        }
        if (sql.startsWith("INSERT INTO history")) {
          const [bot, user, expr, result, ts] = a as [string, number, string, string, number];
          self.history.push({ id: ++self.seq, bot_id: bot, user_id: user, expr, result, ts });
          return {};
        }
        if (sql.startsWith("DELETE FROM history WHERE bot_id = ? AND user_id = ? AND id NOT IN")) {
          const [bot, user, , , limit] = a as [string, number, string, number, number];
          const keep = new Set(
            self.history
              .filter((h) => h.bot_id === bot && h.user_id === user)
              .sort((x, y) => y.id - x.id)
              .slice(0, limit)
              .map((h) => h.id),
          );
          self.history = self.history.filter((h) => !(h.bot_id === bot && h.user_id === user) || keep.has(h.id));
          return {};
        }
        if (sql.startsWith("DELETE FROM history WHERE bot_id = ? AND user_id = ?")) {
          const [bot, user] = a as [string, number];
          self.history = self.history.filter((h) => !(h.bot_id === bot && h.user_id === user));
          return {};
        }
        throw new Error("AppDb.run unsupported: " + sql);
      },
    };
    return stmt;
  }

  setPro(botId: string, userId: number, until: number): void {
    const k = `${botId}:${userId}`;
    const u = this.users.get(k) ?? { lang: null, angle: "deg", digits: 12, keep_history: 0, pro_until: 0 };
    this.users.set(k, { ...u, pro_until: until });
  }
}

export async function makeBotRow(config: Record<string, unknown> = {}, enabled = 1): Promise<Record<string, unknown>> {
  return {
    id: BOT_ID,
    token_enc: await encryptToken(TEST_KEY, BOT_TOKEN),
    secret: "s",
    bot_info: "{}",
    template: "calc",
    config: JSON.stringify(config),
    enabled,
    created_at: 1,
  };
}

export async function setup(config: Record<string, unknown> = {}): Promise<{ db: AppDb; env: Env }> {
  const db = new AppDb();
  db.bots.set(BOT_ID, await makeBotRow(config));
  const env = {
    DB: db as unknown as D1Database,
    TOKEN_KEY: TEST_KEY,
    ADMIN_TOKEN,
    PUBLIC_BASE_URL: "https://example.test",
    APP_ENV: "production",
    INITDATA_MAX_AGE_S: "3600",
  } as Env;
  return { db, env };
}

export interface CallOpts {
  method?: string;
  initData?: string | null;
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
}

export function apiRequest(action: string, o: CallOpts = {}, botId = BOT_ID): Request {
  const headers: Record<string, string> = { "cf-connecting-ip": "203.0.113.9", ...(o.headers ?? {}) };
  if (o.initData) headers.authorization = `tma ${o.initData}`;
  let body: string | undefined;
  if (o.rawBody !== undefined) body = o.rawBody;
  else if (o.body !== undefined) body = JSON.stringify(o.body);
  if (body !== undefined && !headers["content-type"]) headers["content-type"] = "application/json";
  return new Request(`https://example.test/api/app/${botId}/${action}`, { method: o.method ?? "GET", headers, body });
}
