// Slash commands of the calc template.

import { InlineKeyboard, type Bot, type Context } from "grammy";
import {
  Decimal,
  derivative,
  explainArithmetic,
  formatLocale,
  integrate,
  loan,
  parseLoanArgs,
  renderSteps,
  solveEquation,
  vat,
  type Step,
} from "../../calc";
import { touchUser } from "../../db";
import { t, wrapForRtl, type Lang, type MessageKey } from "../../i18n";
import { errInfo, log } from "../../log";
import { historyLimit } from "../../pro";
import { widgetSendParams } from "../../widget/send";
import { requirePro } from "./pro";
import { computeConvertCommand, type Computed } from "./engine";
import { clearAns } from "./memory";
import { code, esc, line, renderComputed } from "./render";
import {
  clearHistory,
  DIGIT_CHOICES,
  deleteUserData,
  isDigits,
  listHistory,
  setUserField,
  type UserField,
  type UserState,
} from "./store";
import {
  computeOptions,
  displayName,
  isLang,
  isNotModified,
  langKeyboard,
  loadUser,
  reply,
  type Svc,
} from "./shared";

const isPrivate = (ctx: Context): boolean => ctx.chat?.type === "private";

/** Mini App URL (`?b=<botId>`), or null when PUBLIC_BASE_URL is not configured. */
export function miniAppUrl(svc: Svc): string | null {
  const base = svc.appConfig.publicBaseUrl;
  if (!base) return null;
  return `${base}${svc.config.miniAppPath}?b=${encodeURIComponent(svc.botId)}`;
}

/** Amount with exactly two decimals in the language's separators (scientific form is left as is). */
function money(d: Decimal, lang: Lang): string {
  const s = formatLocale(d, lang, { significant: 30, sciUpper: 40, maxFraction: 2 });
  if (s.includes("×")) return s;
  const sep = formatLocale(lang).decimalSep ?? ".";
  const at = s.lastIndexOf(sep);
  if (at < 0) return `${s}${sep}00`;
  return s.length - at - 1 === 1 ? `${s}0` : s;
}

// ---------- settings ----------

function settingsText(lang: Lang, st: UserState): string {
  const on = t(lang, st.keepHistory ? "btn_on" : "btn_off");
  return [
    t(lang, "settings_title"),
    "",
    `${t(lang, "settings_angle")}\n→ <b>${st.angle}</b>`,
    "",
    `${t(lang, "settings_digits")}\n→ <b>${st.digits}</b>`,
    "",
    `${t(lang, "settings_history")}\n→ <b>${esc(on)}</b>`,
  ].join("\n");
}

function settingsKeyboard(lang: Lang, st: UserState): InlineKeyboard {
  const mark = (active: boolean, label: string) => (active ? `✓ ${label}` : label);
  const kb = new InlineKeyboard()
    .text(mark(st.angle === "deg", "📐 deg"), "st:a:deg")
    .text(mark(st.angle === "rad", "rad"), "st:a:rad")
    .row();
  DIGIT_CHOICES.forEach((d, i) => kb.text(mark(st.digits === d, i === 0 ? `🔢 ${d}` : String(d)), `st:d:${d}`));
  kb.row().text(`🕘 ${t(lang, st.keepHistory ? "btn_on" : "btn_off")}`, `st:h:${st.keepHistory ? 0 : 1}`);
  return kb;
}

// ---------- symbolic helpers ----------

/** First single-letter identifier that is not the constant e; "x" by default. */
export function pickVariable(text: string): string {
  const m = /(?<![A-Za-z])[a-df-zA-DF-Z](?![A-Za-z(])/.exec(text);
  return m ? m[0] : "x";
}

const MAX_STEPS_TEXT = 3600;

function symErrorKey(code: string): MessageKey {
  switch (code) {
    case "too_complex":
      return "err_too_complex";
    case "unsupported":
    case "unknown_function":
      return "err_unsupported";
    case "div_zero":
      return "err_div0";
    case "domain":
    case "divergent":
      return "err_domain";
    default:
      return "err_parse";
  }
}

/** Header + as many steps as fit into one Telegram message. */
function stepsMessage(lang: Lang, head: string, steps: readonly Step[]): string {
  let n = steps.length;
  for (;;) {
    const body = n > 0 ? "\n\n" + renderSteps(steps.slice(0, n), lang) : "";
    if (body.length <= MAX_STEPS_TEXT || n === 0) return head + body;
    n--;
  }
}

type SymKind = "solve" | "derive" | "integrate";

async function runSymbolic(svc: Svc, ctx: Context, kind: SymKind, args: string): Promise<void> {
  const u = await loadUser(svc, ctx.from);
  const lang = u.lang;
  if (args === "") {
    await reply(ctx, t(lang, "symbolic_help"));
    return;
  }
  if (!(await requirePro(ctx, lang, { botId: svc.botId, db: svc.db, now: svc.now }))) return;

  let head: string;
  let steps: Step[];
  let failure: { error: string } | null = null;
  const v = pickVariable(args);
  const label = (text: string) => code(lang, text.length > 600 ? text.slice(0, 599) + "…" : text);
  if (kind === "solve") {
    if (args.includes("=")) {
      const r = solveEquation(args, v);
      if (!r.ok) failure = r;
      head = r.ok ? `${label(args)}\n→ ${label(r.text)}` : "";
      steps = r.ok ? r.steps : [];
    } else {
      const r = explainArithmetic(args, { digits: u.state.digits });
      if (!r.ok) failure = r;
      head = r.ok ? `${label(args)}\n→ ${label(r.result)}` : "";
      steps = r.ok ? r.steps : [];
    }
  } else if (kind === "derive") {
    const r = derivative(args, v);
    if (!r.ok) failure = r;
    head = r.ok ? `d/d${esc(v)} ${label(args)}\n→ ${label(r.text)}` : "";
    steps = r.ok ? r.steps : [];
  } else {
    const r = integrate(args, v);
    if (!r.ok) failure = r;
    head = r.ok ? `∫ ${label(args)} d${esc(v)}\n→ ${label(r.text)}` : "";
    steps = r.ok ? r.steps : [];
  }

  if (failure) {
    const key = symErrorKey(failure.error);
    const url = key === "err_too_complex" && isPrivate(ctx) ? miniAppUrl(svc) : null;
    await reply(ctx, t(lang, key, { pos: 1, name: "?" }), url ? { reply_markup: new InlineKeyboard().webApp(t(lang, "mini_open"), url) } : {});
    return;
  }
  const msg = stepsMessage(lang, head, steps);
  await reply(ctx, msg.length > 4096 ? t(lang, "err_too_complex") : msg);
}

// ---------- /vat ----------

const VAT_REMOVE = new Set(["remove", "extract", "incl", "gross"]);
const VAT_ADD = new Set(["add", "net", "excl"]);
const VAT_NUM = /^\d+(?:[.,]\d+)?%?$/;

export function parseVatArgs(text: string): { amount: Decimal; rate?: Decimal; mode: "add" | "remove" } | null {
  const toks = text.trim().split(/\s+/).filter(Boolean);
  let mode: "add" | "remove" = "add";
  const nums: string[] = [];
  for (const raw of toks) {
    const w = raw.toLowerCase();
    if (VAT_REMOVE.has(w)) mode = "remove";
    else if (VAT_ADD.has(w)) mode = "add";
    else if (VAT_NUM.test(w)) nums.push(w.replace("%", "").replace(",", "."));
    else return null;
  }
  if (nums.length < 1 || nums.length > 2) return null;
  try {
    const amount = Decimal.parse(nums[0]);
    return nums[1] !== undefined ? { amount, rate: Decimal.parse(nums[1]), mode } : { amount, mode };
  } catch {
    return null;
  }
}

// ---------- history text ----------

const MAX_HISTORY_TEXT = 3800;

// ---------- install ----------

export function installCommands(bot: Bot, svc: Svc): void {
  const { db, botId } = svc;

  bot.command("start", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const u = await loadUser(svc, from);
    const priv = isPrivate(ctx);
    if (priv) {
      try {
        await touchUser(db, botId, from.id, svc.now());
      } catch (e) {
        log("warn", "calc: touchUser failed", { botId, error: errInfo(e) });
      }
    }
    const first = priv && u.state.lang === null;
    await reply(ctx, t(u.lang, "start", { name: esc(displayName(from)) }), first ? { reply_markup: langKeyboard("ls") } : {});
  });

  bot.command("help", async (ctx) => {
    const u = await loadUser(svc, ctx.from);
    await reply(ctx, t(u.lang, "help"));
  });

  const withContact = (text: string): string =>
    svc.config.supportContact ? `${text}\n\n💬 ${esc(svc.config.supportContact)}` : text;

  bot.command("privacy", async (ctx) => {
    const u = await loadUser(svc, ctx.from);
    await reply(ctx, withContact(t(u.lang, "privacy")));
  });
  bot.command("terms", async (ctx) => {
    const u = await loadUser(svc, ctx.from);
    await reply(ctx, withContact(t(u.lang, "terms")));
  });

  // ----- language -----
  bot.command("lang", async (ctx) => {
    const u = await loadUser(svc, ctx.from);
    await reply(ctx, t(u.lang, "lang_menu_title"), { reply_markup: langKeyboard("lg") });
  });

  bot.callbackQuery(/^l([gs]):([a-z-]{2,8})$/, async (ctx) => {
    const target = ctx.match[2];
    if (!isLang(target)) {
      await ctx.answerCallbackQuery();
      return;
    }
    try {
      await setUserField(db, botId, ctx.from.id, "lang", target, svc.now());
    } catch (e) {
      log("error", "calc: set lang failed", { botId, error: errInfo(e) });
      await ctx.answerCallbackQuery({ text: t(target, "err_generic").replace(/^⚠️\s*/, ""), show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    const text =
      ctx.match[1] === "s" ? t(target, "start", { name: esc(displayName(ctx.from)) }) : t(target, "lang_changed");
    try {
      await ctx.editMessageText(text, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    } catch (e) {
      if (!isNotModified(e)) log("warn", "calc: lang edit failed", { botId, error: errInfo(e) });
    }
  });

  // ----- settings -----
  bot.command("settings", async (ctx) => {
    const u = await loadUser(svc, ctx.from);
    await reply(ctx, settingsText(u.lang, u.state), { reply_markup: settingsKeyboard(u.lang, u.state) });
  });

  bot.callbackQuery(/^st:([adh]):(\w{1,4})$/, async (ctx) => {
    const [, kind, val] = ctx.match;
    const u = await loadUser(svc, ctx.from);
    const next: UserState = { ...u.state };
    let change: [UserField, string | number] | null = null;
    if (kind === "a" && (val === "deg" || val === "rad")) {
      if (val !== next.angle) change = ["angle", val];
      next.angle = val;
    } else if (kind === "d" && isDigits(Number(val))) {
      if (Number(val) !== next.digits) change = ["digits", Number(val)];
      next.digits = Number(val) as UserState["digits"];
    } else if (kind === "h" && (val === "0" || val === "1")) {
      const want = val === "1";
      if (want !== next.keepHistory) change = ["keep_history", want ? 1 : 0];
      next.keepHistory = want;
    }
    if (change) {
      try {
        await setUserField(db, botId, ctx.from.id, change[0], change[1], svc.now());
      } catch (e) {
        log("error", "calc: setting save failed", { botId, error: errInfo(e) });
        await ctx.answerCallbackQuery({ text: t(u.lang, "err_generic").replace(/^⚠️\s*/, ""), show_alert: true });
        return;
      }
    }
    await ctx.answerCallbackQuery();
    if (!change) return;
    try {
      await ctx.editMessageText(settingsText(u.lang, next), {
        parse_mode: "HTML",
        reply_markup: settingsKeyboard(u.lang, next),
      });
    } catch (e) {
      if (!isNotModified(e)) log("warn", "calc: settings edit failed", { botId, error: errInfo(e) });
    }
  });

  // ----- history -----
  bot.command("history", async (ctx) => {
    if (!isPrivate(ctx) || !ctx.from) return; // personal data never goes into a group
    const u = await loadUser(svc, ctx.from);
    if (String(ctx.match ?? "").trim().toLowerCase() === "clear") {
      await clearHistory(db, botId, ctx.from.id);
      await reply(ctx, t(u.lang, "history_cleared"));
      return;
    }
    const rows = await listHistory(db, botId, ctx.from.id, historyLimit(u.isPro));
    if (rows.length === 0) {
      await reply(ctx, t(u.lang, "history_empty"));
      return;
    }
    const out: string[] = [t(u.lang, "history_title")];
    let size = out[0].length;
    rows.forEach((r, i) => {
      const l = `${i + 1}. ${line(u.lang, r.expr, r.result)}`;
      if (size + l.length + 1 > MAX_HISTORY_TEXT) return;
      size += l.length + 1;
      out.push(l);
    });
    await reply(ctx, out.join("\n"));
  });

  // ----- converter -----
  bot.command("convert", async (ctx) => {
    const u = await loadUser(svc, ctx.from);
    const args = String(ctx.match ?? "").trim();
    let res: Computed | null = null;
    if (args !== "") res = await computeConvertCommand(args, computeOptions(svc, u, ctx.from?.id, false));
    const text = res ? renderComputed(u.lang, res) : null;
    await reply(ctx, text ?? t(u.lang, "converter_help"));
  });

  // ----- loan -----
  bot.command("loan", async (ctx) => {
    const u = await loadUser(svc, ctx.from);
    const lang = u.lang;
    const args = String(ctx.match ?? "").trim();
    const parsed = args === "" ? null : parseLoanArgs(args);
    if (!parsed || !parsed.ok) {
      await reply(ctx, t(lang, "loan_help"));
      return;
    }
    let r: ReturnType<typeof loan>;
    try {
      r = loan({ principal: parsed.principal, annualRatePct: parsed.annualRatePct, months: parsed.months, type: parsed.type });
    } catch {
      await reply(ctx, t(lang, "loan_help"));
      return;
    }
    const pay =
      r.type === "diff" && r.firstPayment && r.lastPayment
        ? `${money(r.firstPayment, lang)} → ${money(r.lastPayment, lang)}`
        : money(r.monthly ?? r.total, lang);
    const n = Math.min(u.isPro ? 12 : 6, r.schedule.length);
    const rows = r.schedule
      .slice(0, n)
      .map(
        (s) =>
          code(lang, `${s.month}. ${money(s.payment, lang)} = ${money(s.principal, lang)} + ${money(s.interest, lang)} → ${money(s.balance, lang)}`),
      );
    const text = [
      `<b>${t(lang, "loan_label_monthly")}</b>: ${code(lang, pay)}`,
      `<b>${t(lang, "loan_label_total")}</b>: ${code(lang, money(r.total, lang))}`,
      `<b>${t(lang, "loan_label_interest")}</b>: ${code(lang, `${money(r.interest, lang)} (${formatLocale(r.overpaymentPct, lang, { significant: 30, maxFraction: 1, sciUpper: 40 })}%)`)}`,
      "",
      `<b>${t(lang, "loan_schedule_title", { n })}</b>`,
      `<i>${esc(wrapForRtl(lang, t(lang, "loan_row_legend")))}</i>`,
      ...rows,
    ].join("\n");
    await reply(ctx, text);
  });

  // ----- VAT -----
  bot.command("vat", async (ctx) => {
    const u = await loadUser(svc, ctx.from);
    const lang = u.lang;
    const parsed = parseVatArgs(String(ctx.match ?? ""));
    if (!parsed) {
      await reply(ctx, t(lang, "vat_help"));
      return;
    }
    let r: ReturnType<typeof vat>;
    try {
      r = vat({ amount: parsed.amount, ...(parsed.rate ? { ratePct: parsed.rate } : {}), mode: parsed.mode });
    } catch {
      await reply(ctx, t(lang, "vat_help"));
      return;
    }
    const rate = parsed.rate ?? Decimal.from(12);
    const text = [
      `<b>${t(lang, "vat_label_net")}</b>: ${code(lang, money(r.net, lang))}`,
      `<b>${t(lang, "vat_label_vat")}</b> (${esc(rate.toString())}%): ${code(lang, money(r.vat, lang))}`,
      `<b>${t(lang, "vat_label_gross")}</b>: ${code(lang, money(r.gross, lang))}`,
    ].join("\n");
    await reply(ctx, text);
  });

  // ----- widget and Mini App -----
  bot.command("widget", async (ctx) => {
    const u = await loadUser(svc, ctx.from);
    if (!isPrivate(ctx) || !ctx.chat) {
      await reply(ctx, t(u.lang, "widget_unavailable"));
      return;
    }
    try {
      // sendWidget (Bot API 10.4) is not in grammY's typings yet: raw call with the official parameter names.
      const raw = ctx.api.raw as unknown as Record<string, (payload: Record<string, unknown>) => Promise<unknown>>;
      await raw.sendWidget(widgetSendParams(u.lang, ctx.chat.id) as unknown as Record<string, unknown>);
    } catch (e) {
      log("warn", "calc: sendWidget failed", { botId, error: errInfo(e) });
      await reply(ctx, t(u.lang, "widget_unavailable"));
    }
  });

  bot.command("app", async (ctx) => {
    const u = await loadUser(svc, ctx.from);
    const url = miniAppUrl(svc);
    if (!url) {
      log("warn", "calc: /app without PUBLIC_BASE_URL", { botId });
      await reply(ctx, t(u.lang, "err_generic"));
      return;
    }
    const kb = isPrivate(ctx)
      ? new InlineKeyboard().webApp(t(u.lang, "mini_open"), url)
      : new InlineKeyboard().url(t(u.lang, "mini_open"), `https://t.me/${ctx.me.username}`);
    await reply(ctx, t(u.lang, "mini_open"), { reply_markup: kb });
  });

  // ----- Pro-only symbolic math -----
  bot.command("solve", (ctx) => runSymbolic(svc, ctx, "solve", String(ctx.match ?? "").trim()));
  bot.command("derive", (ctx) => runSymbolic(svc, ctx, "derive", String(ctx.match ?? "").trim()));
  bot.command("integrate", (ctx) => runSymbolic(svc, ctx, "integrate", String(ctx.match ?? "").trim()));

  // ----- /deleteme -----
  bot.command("deleteme", async (ctx) => {
    const u = await loadUser(svc, ctx.from);
    await reply(ctx, t(u.lang, "deleteme_confirm"), {
      reply_markup: new InlineKeyboard().text(t(u.lang, "btn_delete"), "dm:y").text(t(u.lang, "btn_cancel"), "dm:n"),
    });
  });

  bot.callbackQuery(/^dm:([yn])$/, async (ctx) => {
    const u = await loadUser(svc, ctx.from);
    const lang = u.lang;
    if (ctx.match[1] === "n") {
      await ctx.answerCallbackQuery();
      try {
        await ctx.editMessageText(esc(t(lang, "btn_cancel")), { parse_mode: "HTML" });
      } catch (e) {
        if (!isNotModified(e)) log("warn", "calc: deleteme cancel edit failed", { botId, error: errInfo(e) });
      }
      return;
    }
    try {
      await deleteUserData(db, botId, ctx.from.id, svc.now());
      clearAns(botId, ctx.from.id);
    } catch (e) {
      log("error", "calc: deleteme failed", { botId, error: errInfo(e) });
      await ctx.answerCallbackQuery({ text: t(lang, "err_generic").replace(/^⚠️\s*/, ""), show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    try {
      await ctx.editMessageText(`${t(lang, "deleteme_done")}\n\n${t(lang, "deleteme_payments_note")}`, { parse_mode: "HTML" });
    } catch (e) {
      if (!isNotModified(e)) log("warn", "calc: deleteme edit failed", { botId, error: errInfo(e) });
    }
  });
}
