import type { Db, Stmt } from "../src/db";
import { encryptToken } from "../src/crypto";
import type { Env } from "../src/env";

export const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
export const ADMIN = "admin-secret-123";

/** Faqat shu loyiha ishlatadigan so'rovlarni qo'llaydigan xotiradagi D1 o'rniga qo'yiladigan soxta baza. */
export class FakeDb implements Db {
  bots = new Map<string, Record<string, unknown>>();
  users = new Set<string>();

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
        throw new Error("FakeDb.first: qo'llab-quvvatlanmaydi: " + sql);
      },
      async all<T>() {
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
        if (sql.startsWith("INSERT OR IGNORE INTO bot_users")) {
          self.users.add(`${args[0]}:${args[1]}`);
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
  opts: { id?: string; secret?: string; enabled?: number; channels?: string[] } = {},
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
    template: "forcesub",
    config: JSON.stringify({ channels: opts.channels ?? ["@kanal_bir", "@kanal_ikki"] }),
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
