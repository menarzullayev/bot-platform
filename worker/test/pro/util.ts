import { Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { installPro, type ProDeps } from "../../src/templates/calc/pro";
import { FakeDb } from "../helpers";

export const NOW = 1_700_000_000;
export const DAY = 86_400;
export const PERIOD = 2_592_000;

export interface Call {
  method: string;
  payload: Record<string, unknown>;
}

export interface Harness {
  bot: Bot;
  db: FakeDb;
  calls: Call[];
  clock: { now: number };
  send(update: Record<string, unknown>): Promise<void>;
  sent(method: string): Call[];
}

let updateId = 1000;

/** A Bot with installPro and a recording transport: no network, no real token. */
export function harness(
  opts: { db?: FakeDb; supportContact?: string; botId?: string; proStars?: number; failMethods?: string[]; clock?: { now: number } } = {},
): Harness {
  const db = opts.db ?? new FakeDb();
  const clock = opts.clock ?? { now: NOW };
  const botInfo = {
    id: 123456,
    is_bot: true,
    first_name: "T",
    username: "t_bot",
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
  } as unknown as UserFromGetMe;
  const bot = new Bot("123456:TESTTOKENTESTTOKENTESTTOKENTEST12", { botInfo });
  const calls: Call[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    if (opts.failMethods?.includes(method)) throw new Error("boom " + method);
    if (method === "createInvoiceLink") return { ok: true, result: "https://t.me/$testslug" } as never;
    return { ok: true, result: true } as never;
  });
  const deps: ProDeps = {
    botId: opts.botId ?? "b1",
    db,
    now: () => clock.now,
    proStars: opts.proStars ?? 150,
    defaultLang: "en",
    supportContact: opts.supportContact,
  };
  installPro(bot, deps);
  return {
    bot,
    db,
    calls,
    clock,
    send: (u) => bot.handleUpdate({ update_id: ++updateId, ...u } as never),
    sent: (m) => calls.filter((c) => c.method === m),
  };
}

export const user = (id = 5, language_code = "en") => ({ id, is_bot: false, first_name: "U", language_code });
const chat = (id = 5) => ({ id, type: "private", first_name: "U" });

export function command(text: string, from = 5) {
  return {
    message: {
      message_id: 1,
      date: NOW,
      chat: chat(from),
      from: user(from),
      text,
      entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0].length }],
    },
  };
}

export function callback(data: string, from = 5) {
  return {
    callback_query: {
      id: "cb1",
      from: user(from),
      chat_instance: "x",
      data,
      message: { message_id: 9, date: NOW, chat: chat(from) },
    },
  };
}

export function preCheckout(payload: unknown, from = 5, extra: Record<string, unknown> = {}) {
  return {
    pre_checkout_query: {
      id: "pq1",
      from: user(from),
      currency: "XTR",
      total_amount: 150,
      invoice_payload: payload,
      ...extra,
    },
  };
}

export function successfulPayment(
  sp: { payload: string; chargeId: string; stars?: number } & Record<string, unknown>,
  from = 5,
) {
  const { payload, chargeId, stars, ...rest } = sp;
  return {
    message: {
      message_id: 2,
      date: NOW,
      chat: chat(from),
      from: user(from),
      successful_payment: {
        currency: "XTR",
        total_amount: stars ?? 150,
        invoice_payload: payload,
        telegram_payment_charge_id: chargeId,
        provider_payment_charge_id: "",
        ...rest,
      },
    },
  };
}
