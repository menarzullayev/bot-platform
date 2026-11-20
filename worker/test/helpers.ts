import type { Db, Stmt } from "../src/db";
import { encryptToken } from "../src/crypto";
import type { Env } from "../src/env";

export const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
export const ADMIN = "admin-secret-123";

/** Faqat shu loyiha ishlatadigan so'rovlarni qo'llaydigan xotiradagi D1 o'rniga qo'yiladigan soxta baza. */
export class FakeDb implements Db {
  bots = new Map<string, Record<string, unknown>>();
  users = new Set<string>();
  /** calc `users` table (Stars/Pro module), keyed "botId:userId". */
  proUsers = new Map<string, { bot_id: string; user_id: number; lang: string | null; pro_until: number }>();
  /** `payments` table keyed by charge_id; seq emulates rowid ordering. */
  payments = new Map<string, Record<string, unknown> & { seq: number }>();
  private paySeq = 0;

  prepare(sql: string): Stmt {
    const self = this;
    let args: unknown[] = [];
    const stmt: Stmt = {
      bind(...v: unknown[]) {
        args = v;
        return stmt;
      },
      async first<T>() {
        if (sql.startsWith("SELECT id, token_enc")) return (self.bots.get(String(args[0])) as T) ?? null;
        if (sql.startsWith("SELECT pro_until, lang FROM users")) {
          return (self.proUsers.get(`${args[0]}:${args[1]}`) as T) ?? null;
        }
        if (sql.startsWith("SELECT charge_id, bot_id, user_id, stars, kind, period_end, created_at, refunded FROM payments WHERE charge_id")) {
          return (self.payments.get(String(args[0])) as T) ?? null;
        }
        throw new Error("FakeDb.first: qo'llab-quvvatlanmaydi: " + sql);
      },
      async all<T>() {
        if (sql.startsWith("SELECT bot_id, COUNT(*)")) {
          const counts = new Map<string, number>();
          for (const u of self.users) {
            const b = u.split(":")[0];
            counts.set(b, (counts.get(b) ?? 0) + 1);
          }
          return { results: [...counts].map(([bot_id, n]) => ({ bot_id, n })) as T[] };
        }
        if (sql.startsWith("SELECT charge_id, bot_id, user_id, stars, kind, period_end, created_at, refunded FROM payments WHERE bot_id")) {
          const [bot, user, limit] = args as [string, number, number];
          const rows = [...self.payments.values()]
            .filter((p) => p.bot_id === bot && p.user_id === user)
            .sort((a, b) => (b.created_at as number) - (a.created_at as number) || b.seq - a.seq)
            .slice(0, limit);
          return { results: rows as T[] };
        }
        if (sql.startsWith("SELECT id, template, config FROM bots WHERE enabled")) {
          return {
            results: [...self.bots.values()]
              .filter((b) => b.enabled === 1)
              .map((b) => ({ id: b.id, template: b.template, config: b.config })) as T[],
          };
        }
        if (sql.startsWith("SELECT id, template")) {
          return {
            results: [...self.bots.values()].map((b) => ({
              id: b.id,
              template: b.template,
              enabled: b.enabled,
              created_at: b.created_at,
            })) as T[],
          };
        }
        throw new Error("FakeDb.all: qo'llab-quvvatlanmaydi: " + sql);
      },
      async run() {
        if (sql.startsWith("INSERT INTO bots")) {
          const [id, token_enc, secret, bot_info, template, config, enabled, created_at] = args;
          self.bots.set(String(id), { id, token_enc, secret, bot_info, template, config, enabled, created_at });
          return {};
        }
        if (sql.startsWith("UPDATE bots SET template")) {
          const row = self.bots.get(String(args[2]));
          if (row) {
            row.template = args[0];
            row.config = args[1];
          }
          return {};
        }
        if (sql.startsWith("UPDATE bots SET enabled")) {
          const row = self.bots.get(String(args[1]));
          if (row) row.enabled = args[0];
          return {};
        }
        if (sql.startsWith("INSERT OR IGNORE INTO bot_users")) {
          self.users.add(`${args[0]}:${args[1]}`);
          return {};
        }
        if (sql.startsWith("INSERT OR IGNORE INTO users (bot_id, user_id, created_at, updated_at)")) {
          const key = `${args[0]}:${args[1]}`;
          if (!self.proUsers.has(key)) {
            self.proUsers.set(key, { bot_id: String(args[0]), user_id: Number(args[1]), lang: null, pro_until: 0 });
          }
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("INSERT OR IGNORE INTO payments")) {
          const [charge_id, bot_id, user_id, payload, stars, kind, period_end, created_at] = args;
          if (self.payments.has(String(charge_id))) return { meta: { changes: 0 } };
          self.payments.set(String(charge_id), {
            charge_id, bot_id, user_id, payload, stars, kind, period_end, created_at, refunded: 0, seq: ++self.paySeq,
          });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("UPDATE users SET pro_until = COALESCE((SELECT MAX(period_end)")) {
          const [bot, user] = args as [string, number];
          const row = self.proUsers.get(`${bot}:${user}`);
          if (row) {
            const ends = [...self.payments.values()]
              .filter((p) => p.bot_id === bot && p.user_id === user && p.refunded === 0)
              .map((p) => Number(p.period_end));
            row.pro_until = ends.length ? Math.max(...ends) : 0;
          }
          return {};
        }
        if (sql.startsWith("UPDATE payments SET refunded = 1")) {
          const p = self.payments.get(String(args[0]));
          if (p && p.bot_id === args[1]) p.refunded = 1;
          return {};
        }
        throw new Error("FakeDb.run: qo'llab-quvvatlanmaydi: " + sql);
      },
    };
    return stmt;
  }
}

export function makeEnv(): Env {
  return { DB: undefined as unknown as D1Database, TOKEN_KEY: TEST_KEY, ADMIN_TOKEN: ADMIN };
}

export async function seedBot(
  db: FakeDb,
  opts: { id?: string; secret?: string; enabled?: number; channels?: string[]; template?: string; config?: unknown } = {},
) {
  const id = opts.id ?? "b1";
  db.bots.set(id, {
    id,
    token_enc: await encryptToken(TEST_KEY, "123456:TESTTOKENTESTTOKENTESTTOKENTEST12"),
    secret: opts.secret ?? "s3cret",
    bot_info: JSON.stringify({
      id: 123456,
      is_bot: true,
      first_name: "T",
      username: "t_bot",
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
    }),
    template: opts.template ?? "forcesub",
    config: JSON.stringify(opts.config ?? { channels: opts.channels ?? ["@kanal_bir", "@kanal_ikki"] }),
    enabled: opts.enabled ?? 1,
    created_at: 1,
  });
}

export const startUpdate = {
  update_id: 1,
  message: {
    message_id: 1,
    date: 1,
    chat: { id: 5, type: "private", first_name: "A" },
    from: { id: 5, is_bot: false, first_name: "A" },
    text: "/start",
    entities: [{ type: "bot_command", offset: 0, length: 6 }],
  },
};

export const chkUpdate = {
  update_id: 2,
  callback_query: {
    id: "c1",
    from: { id: 5, is_bot: false, first_name: "A" },
    chat_instance: "x",
    data: "chk",
    message: { message_id: 9, date: 1, chat: { id: 5, type: "private", first_name: "A" } },
  },
};

export function post(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

export interface Call {
  method: string;
  payload: Record<string, unknown>;
}

/** Telegram API chaqiruvlarini yozib boradi va soxta javob beradi. */
export function recorder(memberStatus: "member" | "left") {
  const calls: Call[] = [];
  const configureBot = (bot: import("grammy").Bot) => {
    bot.api.config.use(async (_prev, method, payload) => {
      calls.push({ method, payload: payload as Record<string, unknown> });
      if (method === "getChatMember") return { ok: true, result: { status: memberStatus, user: { id: 5 } } } as never;
      return { ok: true, result: true } as never;
    });
  };
  return { calls, configureBot };
}
