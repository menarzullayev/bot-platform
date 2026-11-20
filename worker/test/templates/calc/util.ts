import { Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import type { Db, Stmt } from "../../../src/db";
import type { AppConfig } from "../../../src/env";
import { calcTemplate } from "../../../src/templates/calc";
import { parseCalcConfig, type CalcConfig } from "../../../src/templates/calc/config";
import { resetMemory, invalidateRates } from "../../../src/templates/calc/memory";
import { resetInsertCounter } from "../../../src/templates/calc/store";
import { FakeDb, makeEnv } from "../../helpers";

export const NOW = 1_800_000_000;

export interface Call {
  method: string;
  payload: Record<string, unknown>;
}

interface UserRowX {
  bot_id: string;
  user_id: number;
  lang: string | null;
  pro_until: number;
  angle?: string;
  digits?: number;
  keep_history?: number;
  created_at?: number;
  updated_at?: number;
}

export interface HistoryX {
  id: number;
  bot_id: string;
  user_id: number;
  expr: string;
  result: string;
  ts: number;
}

export interface FxRowX {
  base: string;
  quote: string;
  rate: string;
  updated_at: number;
  source: string | null;
}

/** FakeDb plus the calc-template statements (users settings, history, fx_rates, bot_users delete), with read/write counters. */
export class CalcFakeDb extends FakeDb {
  history: HistoryX[] = [];
  fx = new Map<string, FxRowX>();
  reads = 0;
  writes = 0;
  sqlLog: string[] = [];
  failSql: RegExp | null = null;
  private histSeq = 0;

  get userRows(): Map<string, UserRowX> {
    return this.proUsers as unknown as Map<string, UserRowX>;
  }

  resetCounters(): void {
    this.reads = 0;
    this.writes = 0;
    this.sqlLog = [];
  }

  prepare(sql: string): Stmt {
    const self = this;
    const inner = super.prepare(sql);
    let args: unknown[] = [];
    const guard = () => {
      if (self.failSql && self.failSql.test(sql)) throw new Error("db down");
    };
    const stmt: Stmt = {
      bind(...v: unknown[]) {
        args = v;
        inner.bind(...v);
        return stmt;
      },
      async first<T>() {
        guard();
        self.reads++;
        self.sqlLog.push("R " + sql);
        if (sql.startsWith("SELECT lang, angle, digits, pro_until, keep_history FROM users")) {
          const r = self.userRows.get(`${args[0]}:${args[1]}`);
          if (!r) return null;
          return {
            lang: r.lang,
            angle: r.angle ?? "deg",
            digits: r.digits ?? 12,
            pro_until: r.pro_until,
            keep_history: r.keep_history ?? 0,
          } as T;
        }
        return inner.first<T>();
      },
      async all<T>() {
        guard();
        self.reads++;
        self.sqlLog.push("R " + sql);
        if (sql.startsWith("SELECT expr, result, ts FROM history")) {
          const [bot, user, limit] = args as [string, number, number];
          const rows = self.history
            .filter((h) => h.bot_id === bot && h.user_id === user)
            .sort((a, b) => b.id - a.id)
            .slice(0, limit)
            .map((h) => ({ expr: h.expr, result: h.result, ts: h.ts }));
          return { results: rows as T[] };
        }
        if (sql.startsWith("SELECT base, quote, rate, updated_at, source FROM fx_rates")) {
          return { results: [...self.fx.values()] as unknown as T[] };
        }
        return inner.all<T>();
      },
      async run() {
        guard();
        self.writes++;
        self.sqlLog.push("W " + sql);
        const m = /^INSERT INTO users \(bot_id, user_id, (\w+), created_at, updated_at\)/.exec(sql);
        if (m) {
          const [bot, user, value, created, updated] = args as [string, number, string | number, number, number];
          const key = `${bot}:${user}`;
          let r = self.userRows.get(key);
          if (!r) {
            r = { bot_id: bot, user_id: user, lang: null, pro_until: 0, angle: "deg", digits: 12, keep_history: 0, created_at: created };
            self.userRows.set(key, r);
          }
          (r as unknown as Record<string, unknown>)[m[1]] = value;
          r.updated_at = updated;
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("INSERT INTO history")) {
          const [bot_id, user_id, expr, result, ts] = args as [string, number, string, string, number];
          self.history.push({ id: ++self.histSeq, bot_id, user_id, expr, result, ts });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("DELETE FROM history WHERE bot_id = ? AND user_id = ? AND id NOT IN")) {
          const [bot, user, , , keep] = args as [string, number, string, number, number];
          const mine = self.history.filter((h) => h.bot_id === bot && h.user_id === user).sort((a, b) => b.id - a.id);
          const drop = new Set(mine.slice(keep).map((h) => h.id));
          self.history = self.history.filter((h) => !drop.has(h.id));
          return {};
        }
        if (sql.startsWith("DELETE FROM history WHERE bot_id = ? AND user_id = ?")) {
          self.history = self.history.filter((h) => !(h.bot_id === args[0] && h.user_id === args[1]));
          return {};
        }
        if (sql.startsWith("UPDATE users SET lang = NULL, angle = 'deg'")) {
          const [now, bot, user] = args as [number, string, number];
          const r = self.userRows.get(`${bot}:${user}`);
          if (r) Object.assign(r, { lang: null, angle: "deg", digits: 12, keep_history: 0, updated_at: now });
          return {};
        }
        if (sql.startsWith("DELETE FROM bot_users WHERE bot_id = ? AND user_id = ?")) {
          self.users.delete(`${args[0]}:${args[1]}`);
          return {};
        }
        if (sql.startsWith("INSERT OR REPLACE INTO fx_rates")) {
          for (let i = 0; i < args.length; i += 5) {
            const [base, quote, rate, ts, source] = args.slice(i, i + 5) as [string, string, string, number, string];
            self.fx.set(`${base}/${quote}`, { base, quote, rate, updated_at: ts, source });
          }
          return {};
        }
        if (sql.startsWith("DELETE FROM fx_rates WHERE base != ?")) {
          for (const [k, v] of [...self.fx]) if (v.base !== args[0]) self.fx.delete(k);
          return {};
        }
        return inner.run();
      },
    };
    return stmt;
  }
}

export const APP_CONFIG: AppConfig = {
  appEnv: "local",
  publicBaseUrl: "https://calc.test",
  logLevel: "info",
  initDataMaxAgeS: 3600,
  defaultLang: "en",
};

export interface Harness {
  bot: Bot;
  db: CalcFakeDb;
  calls: Call[];
  clock: { now: number };
  send(update: Record<string, unknown>): Promise<void>;
  sent(method: string): Call[];
  texts(): string[];
  last(): Call;
}

export interface HarnessOpts {
  db?: CalcFakeDb;
  botId?: string;
  config?: Partial<CalcConfig> | Record<string, unknown>;
  appConfig?: Partial<AppConfig>;
  clock?: { now: number };
  rateLimited?: (uid: number) => boolean;
  failMethods?: string[];
  fetchFn?: typeof fetch;
  /** Overrides the transport result of a method. */
  results?: Record<string, unknown>;
}

let updateId = 5000;

export function harness(o: HarnessOpts = {}): Harness {
  resetMemory();
  resetInsertCounter();
  const db = o.db ?? new CalcFakeDb();
  invalidateRates(db);
  const clock = o.clock ?? { now: NOW };
  const botInfo = {
    id: 123456,
    is_bot: true,
    first_name: "T",
    username: "tezcalc_bot",
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: true,
  } as unknown as UserFromGetMe;
  const bot = new Bot("123456:TESTTOKENTESTTOKENTESTTOKENTEST12", { botInfo });
  const calls: Call[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    if (o.failMethods?.includes(method)) throw new Error("boom " + method);
    if (o.results && method in o.results) return { ok: true, result: o.results[method] } as never;
    if (method === "createInvoiceLink") return { ok: true, result: "https://t.me/$testslug" } as never;
    if (method === "sendMessage")
      return { ok: true, result: { message_id: 1, date: NOW, chat: { id: (payload as { chat_id: number }).chat_id, type: "private" }, text: "x" } } as never;
    if (method === "answerGuestQuery") return { ok: true, result: { inline_message_id: "im1" } } as never;
    return { ok: true, result: true } as never;
  });
  const config = parseCalcConfig(o.config ?? {});
  calcTemplate.install(bot, {
    botId: o.botId ?? "b1",
    db,
    env: makeEnv(),
    config,
    appConfig: { ...APP_CONFIG, ...o.appConfig },
    now: () => clock.now,
    fetchFn: o.fetchFn ?? (fetch as typeof fetch),
    rateLimited: o.rateLimited ?? (() => false),
  });
  return {
    bot,
    db,
    calls,
    clock,
    send: (u) => bot.handleUpdate({ update_id: ++updateId, ...u } as never),
    sent: (m) => calls.filter((c) => c.method === m),
    texts: () => calls.filter((c) => c.method === "sendMessage").map((c) => String(c.payload.text)),
    last: () => calls[calls.length - 1],
  };
}

export const user = (id = 5, language_code: string | undefined = "en", first_name = "Ali") => ({
  id,
  is_bot: false,
  first_name,
  ...(language_code ? { language_code } : {}),
});

export const chat = (id = 5, type: "private" | "group" | "supergroup" = "private") =>
  type === "private" ? { id, type, first_name: "Ali" } : { id: -1001, type, title: "G" };

export function text(t: string, o: { from?: number; lang?: string; type?: "private" | "group" | "supergroup" } = {}) {
  const from = o.from ?? 5;
  const entities = t.startsWith("/") ? [{ type: "bot_command", offset: 0, length: t.split(/\s/)[0].length }] : undefined;
  return {
    message: {
      message_id: 10,
      date: NOW,
      chat: chat(from, o.type),
      from: user(from, o.lang ?? "en"),
      text: t,
      ...(entities ? { entities } : {}),
    },
  };
}

export const command = text;

export function callback(data: string, o: { from?: number; lang?: string; type?: "private" | "group" } = {}) {
  const from = o.from ?? 5;
  return {
    callback_query: {
      id: "cb1",
      from: user(from, o.lang ?? "en"),
      chat_instance: "x",
      data,
      message: { message_id: 9, date: NOW, chat: chat(from, o.type), text: "old" },
    },
  };
}

export function inline(query: string, o: { from?: number; lang?: string } = {}) {
  return { inline_query: { id: "iq1", from: user(o.from ?? 5, o.lang ?? "en"), query, offset: "" } };
}

export function guest(t: string, o: { from?: number; lang?: string; queryId?: string | null } = {}) {
  const from = o.from ?? 5;
  return {
    guest_message: {
      message_id: 30,
      date: NOW,
      chat: { id: -1002, type: "supergroup", title: "Other" },
      from: user(from, o.lang ?? "en"),
      text: t,
      ...(o.queryId === null ? {} : { guest_query_id: o.queryId ?? "gq1" }),
    },
  };
}

export function widgetQuery(data: unknown, o: { from?: number; id?: string | null } = {}) {
  return {
    widget_query: {
      ...(o.id === null ? {} : { id: o.id ?? "wq1" }),
      from: user(o.from ?? 5, "en"),
      data,
    },
  };
}

/** Marks a user as Pro in the fake users table. */
export function makePro(db: CalcFakeDb, userId = 5, botId = "b1", until = NOW + 86_400): void {
  db.userRows.set(`${botId}:${userId}`, {
    bot_id: botId,
    user_id: userId,
    lang: null,
    pro_until: until,
    angle: "deg",
    digits: 12,
    keep_history: 0,
  });
}

export function setUser(db: CalcFakeDb, userId: number, patch: Partial<UserRowX>, botId = "b1"): void {
  const key = `${botId}:${userId}`;
  const cur = db.userRows.get(key) ?? { bot_id: botId, user_id: userId, lang: null, pro_until: 0, angle: "deg", digits: 12, keep_history: 0 };
  db.userRows.set(key, { ...cur, ...patch });
}

// ---- FX fixtures ----

const cbuRow = (ccy: string, rate: string, nominal = "1") => ({
  id: 1,
  Code: "000",
  Ccy: ccy,
  CcyNm_RU: "x",
  CcyNm_UZ: "x",
  CcyNm_UZC: "x",
  CcyNm_EN: "x",
  Nominal: nominal,
  Rate: rate,
  Diff: "0",
  Date: "20.11.2026",
});
export const CBU_BODY = [
  cbuRow("USD", "12000"),
  cbuRow("EUR", "13200"),
  cbuRow("RUB", "150"),
  cbuRow("JPY", "80", "10"),
  cbuRow("KZT", "24"),
];

/** Stores a UZS-based table so `100 USD to UZS` = 1 200 000. */
export function seedRates(db: CalcFakeDb, updatedAt = NOW - 3600): void {
  const rates: Record<string, string> = { UZS: "1", USD: String(1 / 12000), EUR: String(1 / 13200), RUB: String(1 / 150) };
  for (const [quote, rate] of Object.entries(rates)) {
    db.fx.set(`UZS/${quote}`, { base: "UZS", quote, rate, updated_at: updatedAt, source: "cbu" });
  }
}

export function fakeFetch(handler: (url: string) => unknown | Response | Promise<unknown | Response>): { fn: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    const r = await handler(url);
    if (r instanceof Response) return r;
    return new Response(JSON.stringify(r), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fn, urls };
}

export type { Db };
