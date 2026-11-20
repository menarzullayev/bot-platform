import { Bot, InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import { touchUser, type Db } from "../db";
import type { Template } from "./index";

export interface ForceSubConfig {
  /** "@kanal_nomi" yoki raqamli chat id. Eng ko'pi 5 ta (Worker subrequest limiti uchun). */
  channels: string[];
  welcome?: string;
  success?: string;
}

export const MAX_CHANNELS = 5;

export function parseForceSubConfig(raw: unknown): ForceSubConfig {
  const c = (raw ?? {}) as Partial<ForceSubConfig>;
  const channels = Array.isArray(c.channels) ? c.channels.map(String) : [];
  if (channels.length === 0 || channels.length > MAX_CHANNELS) {
    throw new Error(`channels: 1 dan ${MAX_CHANNELS} gacha bo'lishi kerak`);
  }
  for (const ch of channels) {
    if (!/^@[A-Za-z0-9_]{4,32}$/.test(ch) && !/^-100\d{5,}$/.test(ch)) {
      throw new Error(`noto'g'ri kanal: ${ch}`);
    }
  }
  return {
    channels,
    welcome: c.welcome?.slice(0, 1000),
    success: c.success?.slice(0, 1000),
  };
}

const ACTIVE = new Set(["creator", "administrator", "member"]);

async function isMember(ctx: Context, chat: string, userId: number): Promise<boolean> {
  try {
    const m = await ctx.api.getChatMember(chat, userId);
    if (ACTIVE.has(m.status)) return true;
    return m.status === "restricted" && (m as { is_member?: boolean }).is_member === true;
  } catch {
    // bot kanalda admin emas yoki kanal topilmadi: a'zo emas deb hisoblaymiz
    return false;
  }
}

async function missingChannels(ctx: Context, channels: string[], userId: number): Promise<string[]> {
  const results = await Promise.all(channels.map(async (ch) => ((await isMember(ctx, ch, userId)) ? null : ch)));
  return results.filter((x): x is string => x !== null);
}

function keyboard(missing: string[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const ch of missing) {
    if (ch.startsWith("@")) kb.url(`➕ ${ch}`, `https://t.me/${ch.slice(1)}`).row();
  }
  kb.text("✅ Tekshirish", "chk");
  return kb;
}

export function installForceSub(bot: Bot, botId: string, cfg: ForceSubConfig, db: Db, now: () => number): void {
  const welcome = cfg.welcome ?? "Botdan foydalanish uchun quyidagi kanallarga a'zo bo'ling:";
  const success = cfg.success ?? "✅ Rahmat! Siz barcha kanallarga a'zosiz.";

  bot.command("start", async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    await touchUser(db, botId, uid, now());
    const missing = await missingChannels(ctx, cfg.channels, uid);
    if (missing.length === 0) {
      await ctx.reply(success);
    } else {
      await ctx.reply(welcome, { reply_markup: keyboard(missing) });
    }
  });

  bot.callbackQuery("chk", async (ctx) => {
    const uid = ctx.from.id;
    const missing = await missingChannels(ctx, cfg.channels, uid);
    if (missing.length === 0) {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(success);
    } else {
      await ctx.answerCallbackQuery({ text: "Hali hamma kanalga a'zo emassiz", show_alert: true });
    }
  });
}

export const forcesubTemplate: Template<ForceSubConfig> = {
  name: "forcesub",
  parseConfig: parseForceSubConfig,
  install(bot, ctx) {
    installForceSub(bot, ctx.botId, ctx.config, ctx.db, ctx.now);
  },
};
