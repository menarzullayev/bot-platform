import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { Db } from "../../db";
import { detectLang, isLang, t, type Lang } from "../../i18n";
import { errInfo, log } from "../../log";
import {
  STARS_CURRENCY,
  SUBSCRIPTION_PERIOD_S,
  buildPayload,
  checkPaymentPayload,
  getEntitlement,
  getUserLang,
  lastPayments,
  processSuccessfulPayment,
} from "../../pro";

export interface ProDeps {
  botId: string;
  db: Db;
  /** Unix seconds. */
  now: () => number;
  /** Stars per 30-day period (already validated by parseProConfig). */
  proStars: number;
  /** Fallback language when the user has no stored preference and language_code is unsupported. */
  defaultLang: Lang;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "");
const formatDate = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);

/** Stored preference first, then Telegram language_code. Never throws. */
async function resolveLang(ctx: Context, d: ProDeps): Promise<Lang> {
  const uid = ctx.from?.id;
  if (uid !== undefined) {
    try {
      const stored = await getUserLang(d.db, d.botId, uid);
      if (isLang(stored)) return stored;
    } catch (e) {
      log("warn", "pro: lang lookup failed", { botId: d.botId, error: errInfo(e) });
    }
  }
  return detectLang(ctx.from?.language_code, d.defaultLang);
}

/**
 * Gate for Pro-only features. Returns true when the user is Pro; otherwise replies with
 * 'pro_required' (which points to /pro) and returns false. A DB failure is treated as "not Pro".
 */
export async function requirePro(ctx: Context, lang: Lang, d: Pick<ProDeps, "botId" | "db" | "now">): Promise<boolean> {
  const uid = ctx.from?.id;
  if (uid !== undefined) {
    try {
      if ((await getEntitlement(d.db, d.botId, uid, d.now())).isPro) return true;
    } catch (e) {
      log("error", "pro: entitlement lookup failed", { botId: d.botId, error: errInfo(e) });
    }
  }
  await ctx.reply(t(lang, "pro_required"), { parse_mode: "HTML" });
  return false;
}

export function installPro(bot: Bot, d: ProDeps): void {
  // /pro and /pro cancel
  bot.command("pro", async (ctx) => {
    const uid = ctx.from?.id;
    if (uid === undefined) return;
    const lang = await resolveLang(ctx, d);
    if (String(ctx.match ?? "").trim().toLowerCase() === "cancel") {
      await ctx.reply(t(lang, "pro_cancel_info"), { parse_mode: "HTML" });
      return;
    }
    const head = `${t(lang, "pro_title")}\n\n${t(lang, "pro_features")}\n\n`;
    const e = await getEntitlement(d.db, d.botId, uid, d.now());
    if (e.isPro) {
      await ctx.reply(head + t(lang, "pro_active", { date: formatDate(e.proUntil) }), { parse_mode: "HTML" });
      return;
    }
    await ctx.reply(head + t(lang, "pro_price", { stars: d.proStars }), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text(`⭐ ${d.proStars}`, "pro:buy"),
    });
  });

  /*
   * Why createInvoiceLink and not sendInvoice: a recurring Stars subscription needs
   * `subscription_period` (only 2592000 is allowed), and per the Bot API reference that parameter exists on
   * createInvoiceLink (and not on sendInvoice). The link is shown as a URL button; tapping it opens
   * Telegram's native payment sheet. Stars invoices: currency XTR, no provider_token, exactly one price item.
   */
  bot.callbackQuery("pro:buy", async (ctx) => {
    const lang = await resolveLang(ctx, d);
    try {
      await ctx.answerCallbackQuery();
      const uid = ctx.from.id;
      if ((await getEntitlement(d.db, d.botId, uid, d.now())).isPro) {
        await ctx.reply(t(lang, "pro_already"), { parse_mode: "HTML" });
        return;
      }
      const title = stripHtml(t(lang, "pro_title")).slice(0, 32);
      const description = stripHtml(t(lang, "pro_features")).replace(/\s*\n\s*/g, ", ").slice(0, 255);
      const link = await ctx.api.createInvoiceLink(title, description, buildPayload(d.botId, uid), "", STARS_CURRENCY, [
        { label: title, amount: d.proStars },
      ], { subscription_period: SUBSCRIPTION_PERIOD_S });
      await ctx.reply(`${t(lang, "pro_title")}\n\n${t(lang, "pro_price", { stars: d.proStars })}`, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().url(`⭐ ${d.proStars}`, link),
      });
    } catch (e) {
      log("error", "pro: invoice link failed", { botId: d.botId, error: errInfo(e) });
      try {
        await ctx.reply(t(lang, "err_generic"), { parse_mode: "HTML" });
      } catch {
        /* nothing more to do */
      }
    }
  });

  // Telegram cancels the payment unless this is answered within 10 s: no DB access here on purpose.
  bot.on("pre_checkout_query", async (ctx) => {
    const q = ctx.preCheckoutQuery;
    let ok = false;
    let reason = "error";
    try {
      const r = checkPaymentPayload(
        { payload: q.invoice_payload, currency: q.currency, totalAmount: q.total_amount },
        d.botId,
        q.from.id,
      );
      ok = r.ok;
      if (!r.ok) reason = r.reason;
    } catch (e) {
      log("error", "pro: pre_checkout check threw", { botId: d.botId, error: errInfo(e) });
    }
    if (!ok) log("warn", "pro: pre_checkout rejected", { botId: d.botId, userId: q.from.id, reason });
    try {
      if (ok) await ctx.answerPreCheckoutQuery(true);
      else {
        const lang = detectLang(q.from.language_code, d.defaultLang);
        await ctx.answerPreCheckoutQuery(false, { error_message: stripHtml(t(lang, "err_generic")).slice(0, 200) });
      }
    } catch (e) {
      log("error", "pro: answerPreCheckoutQuery failed", { botId: d.botId, error: errInfo(e) });
    }
  });

  bot.on("message:successful_payment", async (ctx) => {
    const sp = ctx.message.successful_payment;
    const fromId = ctx.from?.id;
    if (fromId === undefined) return;
    const lang = await resolveLang(ctx, d);
    const chargeId = sp.telegram_payment_charge_id;
    try {
      const r = await processSuccessfulPayment(d.db, { botId: d.botId, fromId, sp, now: d.now() });
      if (!r.ok) {
        // Money moved but we cannot attribute it: surface it for manual reconciliation / refund.
        log("error", "pro: successful_payment rejected", { botId: d.botId, userId: fromId, chargeId, reason: r.reason });
        await ctx.reply(t(lang, "err_generic") + "\n/paysupport", { parse_mode: "HTML" });
        return;
      }
      if (!r.granted) {
        log("info", "pro: duplicate successful_payment ignored", { botId: d.botId, userId: fromId, chargeId });
        return;
      }
      log("info", "pro: payment granted", {
        botId: d.botId,
        userId: fromId,
        chargeId,
        kind: r.kind,
        stars: sp.total_amount,
        proUntil: r.proUntil,
      });
      const text = r.renewal
        ? t(lang, "pro_active", { date: formatDate(r.proUntil) })
        : t(lang, "pro_thanks");
      await ctx.reply(text, { parse_mode: "HTML" });
    } catch (e) {
      // Webhook answers 200 regardless, so Telegram will not redeliver: the charge id in this log line is the recovery key.
      log("error", "pro: successful_payment processing failed", {
        botId: d.botId,
        userId: fromId,
        chargeId,
        stars: sp.total_amount,
        error: errInfo(e),
      });
      try {
        await ctx.reply(t(lang, "err_generic") + "\n/paysupport", { parse_mode: "HTML" });
      } catch {
        /* ignore */
      }
    }
  });

  bot.command("paysupport", async (ctx) => {
    const uid = ctx.from?.id;
    if (uid === undefined) return;
    const lang = await resolveLang(ctx, d);
    let text = t(lang, "paysupport");
    try {
      const rows = await lastPayments(d.db, d.botId, uid, 3);
      if (rows.length > 0) {
        const lines = rows.map(
          (p) =>
            `${formatDate(p.created_at)} · ${p.stars} ⭐ · <code>${escapeHtml(p.charge_id)}</code>${p.refunded === 1 ? " ↩️" : ""}`,
        );
        text += "\n\n🧾\n" + lines.join("\n");
      }
    } catch (e) {
      log("warn", "pro: paysupport payments lookup failed", { botId: d.botId, error: errInfo(e) });
    }
    await ctx.reply(text, { parse_mode: "HTML" });
  });
}
