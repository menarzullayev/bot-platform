import { globalFetch } from "../http";
// Mini App server API: /api/app/:botId/{me,fx,settings,history,invoice}.
// Auth: `Authorization: tma <initData>` verified against the bot's token (see auth.ts). Same origin, so no CORS.
// The bot token (decrypted from D1) lives only inside authenticate()/createInvoice() and is never logged or returned.

import { decryptToken } from "../crypto";
import { getDegradation, peekDegradation, secondsUntilReset, type DegradeLevel } from "../degrade";
import { getBot, type BotRow, type Db } from "../db";
import type { Env, Lang } from "../env";
import { isStale, loadRates } from "../fx/store";
import { detectLang, isLang, t } from "../i18n";
import { errInfo, log } from "../log";
import { count, type WaitUntil } from "../metrics";
import {
  STARS_CURRENCY,
  SUBSCRIPTION_PERIOD_S,
  buildPayload,
  historyLimit,
  parseProConfig,
  type CalcProConfig,
} from "../pro";
import { RateLimiter } from "../ratelimit";
import { resolveAppConfig, type PlatformDeps } from "../templates";
import { CONTRAST_VALUES, DENSITY_VALUES, FS_VALUES, LITE_VALUES, STYLE_IDS, pickEnum } from "../templates/calc/style";
import { parseAuthHeader, verifyInitData, type TgUser } from "./auth";
import { createCard } from "./cards";
import { HttpError, errorResponse, json, readJson } from "./http";
import { validate, type Spec } from "./schema";

export const API_RE = /^\/api\/app\/([A-Za-z0-9_-]{1,32})\/([a-z]{2,16})$/;

const ACTIONS = {
  me: ["GET"],
  fx: ["GET"],
  settings: ["POST"],
  history: ["GET", "POST", "DELETE"],
  invoice: ["POST"],
  card: ["POST"],
} as const;
type Action = keyof typeof ACTIONS;

export const DIGITS_MIN = 0;
export const DIGITS_MAX = 20;
export const EXPR_MAX = 500;
export const RESULT_MAX = 200;
const LANGS_LIST = ["uz-latn", "uz-cyrl", "ru", "en", "tr", "ar", "es"] as const;

const SETTINGS_SPEC: Spec = {
  angle: { kind: "enum", values: ["deg", "rad"] },
  digits: { kind: "int", min: DIGITS_MIN, max: DIGITS_MAX },
  keep_history: { kind: "bool" },
  lang: { kind: "enum", values: LANGS_LIST },
  style: { kind: "enum", values: STYLE_IDS },
  contrast: { kind: "enum", values: CONTRAST_VALUES },
  density: { kind: "enum", values: DENSITY_VALUES },
  lite: { kind: "enum", values: LITE_VALUES },
  fs: { kind: "enum", values: FS_VALUES },
};
const HISTORY_SPEC: Spec = {
  expr: { kind: "string", min: 1, max: EXPR_MAX },
  result: { kind: "string", min: 1, max: RESULT_MAX },
};

interface Limiters {
  ip: RateLimiter;
  user: RateLimiter;
}
const limiterStore = new WeakMap<object, Limiters>();
let globalLimiters: Limiters | undefined;

function limitersFor(key: object | undefined): Limiters {
  const make = (): Limiters => ({
    // pre-auth, per client address: cheap guard in front of the DB and HMAC work
    ip: new RateLimiter({ capacity: 120, windowMs: 60_000 }),
    // per authenticated user
    user: new RateLimiter({ capacity: 30, windowMs: 10_000 }),
  });
  if (!key) return (globalLimiters ??= make());
  let l = limiterStore.get(key);
  if (!l) {
    l = make();
    limiterStore.set(key, l);
  }
  return l;
}

interface SettingsRow {
  lang: string | null;
  angle: string;
  digits: number;
  keep_history: number;
  pro_until: number;
  style: string | null;
  contrast: string | null;
  density: string | null;
  lite: string | null;
  fs: string | null;
}

interface Settings {
  lang: Lang | null;
  angle: "deg" | "rad";
  digits: number;
  keep_history: boolean;
  /** null = never saved; the client applies its default. */
  style: (typeof STYLE_IDS)[number] | null;
  contrast: (typeof CONTRAST_VALUES)[number] | null;
  density: (typeof DENSITY_VALUES)[number] | null;
  lite: (typeof LITE_VALUES)[number] | null;
  fs: (typeof FS_VALUES)[number] | null;
}

const DEFAULTS: SettingsRow = {
  lang: null,
  angle: "deg",
  digits: 12,
  keep_history: 0,
  pro_until: 0,
  style: null,
  contrast: null,
  density: null,
  lite: null,
  fs: null,
};

async function loadUser(db: Db, botId: string, userId: number): Promise<SettingsRow> {
  const row = await db
    .prepare("SELECT lang, angle, digits, keep_history, pro_until, style, contrast, density, lite, fs FROM users WHERE bot_id = ? AND user_id = ?")
    .bind(botId, userId)
    .first<SettingsRow>();
  return row ?? DEFAULTS;
}

function toSettings(r: SettingsRow): Settings {
  return {
    lang: isLang(r.lang) ? r.lang : null,
    angle: r.angle === "rad" ? "rad" : "deg",
    digits: Number.isInteger(r.digits) ? Math.min(DIGITS_MAX, Math.max(DIGITS_MIN, r.digits)) : 12,
    keep_history: r.keep_history === 1,
    style: pickEnum(STYLE_IDS, r.style),
    contrast: pickEnum(CONTRAST_VALUES, r.contrast),
    density: pickEnum(DENSITY_VALUES, r.density),
    lite: pickEnum(LITE_VALUES, r.lite),
    fs: pickEnum(FS_VALUES, r.fs),
  };
}

/** The settings object of the /me and /settings responses: always these eight keys. */
function settingsJson(s: Settings) {
  return {
    angle: s.angle,
    digits: s.digits,
    keep_history: s.keep_history,
    style: s.style,
    contrast: s.contrast,
    density: s.density,
    lite: s.lite,
    fs: s.fs,
  };
}

function botProConfig(bot: BotRow): CalcProConfig {
  try {
    const cfg = JSON.parse(bot.config) as { pro?: unknown };
    return parseProConfig(cfg && typeof cfg === "object" && cfg.pro && typeof cfg.pro === "object" ? cfg.pro : cfg);
  } catch {
    return parseProConfig(undefined);
  }
}

interface AuthOk {
  bot: BotRow;
  user: TgUser;
  token: string;
}

async function authenticate(
  req: Request,
  env: Env,
  db: Db,
  botId: string,
  now: number,
  maxAgeS: number,
): Promise<AuthOk> {
  const initData = parseAuthHeader(req.headers.get("authorization"));
  if (!initData) throw new HttpError(401, "unauthorized", "missing Authorization: tma <initData>");
  const bot = await getBot(db, botId);
  if (!bot) throw new HttpError(404, "bot_not_found");
  if (bot.enabled !== 1) throw new HttpError(403, "bot_disabled");
  let token: string;
  try {
    token = await decryptToken(env.TOKEN_KEY, bot.token_enc);
  } catch (e) {
    try {
      if (!env.TOKEN_KEY_PREV) throw e;
      token = await decryptToken(env.TOKEN_KEY_PREV, bot.token_enc);
    } catch (e2) {
      log("error", "miniapp: token decrypt failed", { botId, error: errInfo(e2) });
      throw new HttpError(500, "internal");
    }
  }
  const res = await verifyInitData(initData, token, { now, maxAgeS });
  if (!res.ok) {
    log("debug", "miniapp: initData rejected", { botId, reason: res.reason });
    throw new HttpError(401, res.reason === "expired" ? "auth_expired" : "unauthorized", res.reason);
  }
  return { bot, user: res.user, token };
}

function plainText(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function createInvoice(a: {
  fetchFn: typeof fetch;
  token: string;
  bot: BotRow;
  userId: number;
  lang: Lang;
  stars: number;
}): Promise<string> {
  const title = plainText(t(a.lang, "pro_title")).slice(0, 32);
  const description = plainText(t(a.lang, "pro_features")).replace(/\s*\n\s*/g, ", ").slice(0, 255);
  const body = {
    title,
    description,
    payload: buildPayload(a.bot.id, a.userId),
    provider_token: "",
    currency: STARS_CURRENCY,
    prices: [{ label: title, amount: a.stars }],
    subscription_period: SUBSCRIPTION_PERIOD_S,
  };
  let res: Response;
  try {
    res = await a.fetchFn(`https://api.telegram.org/bot${a.token}/createInvoiceLink`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    log("error", "miniapp: createInvoiceLink request failed", { botId: a.bot.id, error: errInfo(e, a.token) });
    throw new HttpError(502, "telegram_unreachable");
  }
  interface TgReply {
    ok?: boolean;
    result?: unknown;
    description?: unknown;
  }
  let data: TgReply | null;
  try {
    data = (await res.json()) as TgReply;
  } catch {
    data = null;
  }
  if (!res.ok || !data?.ok || typeof data.result !== "string" || !data.result.startsWith("https://")) {
    log("error", "miniapp: createInvoiceLink rejected", {
      botId: a.bot.id,
      status: res.status,
      description: typeof data?.description === "string" ? data.description.slice(0, 200) : undefined,
    });
    throw new HttpError(502, "telegram_error");
  }
  return data.result;
}

/** Entry point for every /api/app/* request. Never throws: every failure is a JSON error response. */
export async function handleAppApi(req: Request, env: Env, deps: PlatformDeps = {}, ctx?: WaitUntil): Promise<Response> {
  try {
    return await route(req, env, deps, ctx);
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e);
    log("error", "miniapp: api failed", { error: errInfo(e) });
    return json({ error: "internal" }, 500);
  }
}

async function route(req: Request, env: Env, deps: PlatformDeps, ctx?: WaitUntil): Promise<Response> {
  const url = new URL(req.url);
  const m = API_RE.exec(url.pathname);
  if (!m || !Object.hasOwn(ACTIONS, m[2])) throw new HttpError(404, "not_found");
  const botId = m[1];
  const action = m[2] as Action;
  const allowed: readonly string[] = ACTIONS[action];
  if (!allowed.includes(req.method)) throw new HttpError(405, "method_not_allowed", undefined, { allow: allowed.join(", ") });

  const db: Db = deps.db ?? (env.DB as unknown as Db);
  const nowMs = (deps.nowMs ?? Date.now)();
  const now = (deps.now ?? (() => Math.floor(nowMs / 1000)))();
  const lim = limitersFor(db as unknown as object);
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (lim.ip.limited(ip, nowMs)) throw new HttpError(429, "rate_limited", undefined, { "retry-after": "10" });

  const config = resolveAppConfig(env, deps);

  if (action === "fx") {
    const rates = await loadRates(db);
    if (!rates) throw new HttpError(503, "no_rates");
    return json(
      { base: rates.base, rates: rates.rates, updated_at: rates.updatedAt, source: rates.source ?? null, stale: isStale(rates, now) },
      200,
      { "cache-control": "public, max-age=300" },
    );
  }

  // DEC-013: in light mode the expensive writes are refused before any auth/HMAC/D1 work is spent on them.
  // Writes other than cards use the free in-memory level (refreshed off-path by index.ts); card creation is rare and
  // expensive, so it awaits a fresh-enough total.
  const level: DegradeLevel = action === "card" ? await getDegradation(db, now, config) : peekDegradation(db, now, config);
  const degradedOut = (): HttpError =>
    new HttpError(503, "degraded", "light mode: this feature is temporarily off", { "retry-after": String(secondsUntilReset(now)) });
  if (action === "card" && level >= 1) throw degradedOut();
  if (level >= 2 && (action === "settings" || (action === "history" && req.method === "POST"))) throw degradedOut();

  const auth = await authenticate(req, env, db, botId, now, config.initDataMaxAgeS);
  if (lim.user.limited(`${botId}:${auth.user.id}`, nowMs)) {
    throw new HttpError(429, "rate_limited", undefined, { "retry-after": "5" });
  }
  if (action === "card") {
    return createCard({ req, db, botId, userId: auth.user.id, token: auth.token, config, level, now, nowMs, fetchFn: deps.fetchFn, ctx });
  }
  const row = await loadUser(db, botId, auth.user.id);
  const isPro = row.pro_until > now;

  switch (action) {
    case "me": {
      const s = toSettings(row);
      const lang = s.lang ?? detectLang(auth.user.language_code, config.defaultLang);
      // anonymous aggregates only (DEC-015): the key carries a value (lang/style), never the user
      count(db, botId, "app:open", 1, { nowMs, ctx });
      count(db, botId, `lang:${lang}`, 1, { nowMs, ctx });
      if (s.style) count(db, botId, `style:${s.style}`, 1, { nowMs, ctx });
      return json({
        user: {
          id: auth.user.id,
          first_name: auth.user.first_name,
          ...(auth.user.username ? { username: auth.user.username } : {}),
          ...(auth.user.language_code ? { language_code: auth.user.language_code } : {}),
        },
        lang,
        pro: { is_pro: isPro, pro_until: row.pro_until },
        settings: settingsJson(s),
        limits: { history: historyLimit(isPro) },
        pro_stars: botProConfig(auth.bot).proStars,
        degraded: level,
      });
    }

    case "settings": {
      const v = validate(await readJson(req), SETTINGS_SPEC, { nonEmpty: true });
      if (!v.ok) throw new HttpError(400, "bad_request", v.error);
      const cur = toSettings(row);
      const next = {
        lang: (v.value.lang as Lang | undefined) ?? cur.lang,
        angle: (v.value.angle as "deg" | "rad" | undefined) ?? cur.angle,
        digits: (v.value.digits as number | undefined) ?? cur.digits,
        keep_history: (v.value.keep_history as boolean | undefined) ?? cur.keep_history,
        style: (v.value.style as Settings["style"] | undefined) ?? cur.style,
        contrast: (v.value.contrast as Settings["contrast"] | undefined) ?? cur.contrast,
        density: (v.value.density as Settings["density"] | undefined) ?? cur.density,
        lite: (v.value.lite as Settings["lite"] | undefined) ?? cur.lite,
        fs: (v.value.fs as Settings["fs"] | undefined) ?? cur.fs,
      };
      await db
        .prepare(
          "INSERT INTO users (bot_id, user_id, lang, angle, digits, keep_history, style, contrast, density, lite, fs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
            "ON CONFLICT(bot_id, user_id) DO UPDATE SET lang = excluded.lang, angle = excluded.angle, digits = excluded.digits, keep_history = excluded.keep_history, " +
            "style = excluded.style, contrast = excluded.contrast, density = excluded.density, lite = excluded.lite, fs = excluded.fs, updated_at = excluded.updated_at",
        )
        .bind(
          botId,
          auth.user.id,
          next.lang,
          next.angle,
          next.digits,
          next.keep_history ? 1 : 0,
          next.style,
          next.contrast,
          next.density,
          next.lite,
          next.fs,
          now,
          now,
        )
        .run();
      return json({ settings: settingsJson(next), lang: next.lang });
    }

    case "history": {
      const limit = historyLimit(isPro);
      if (req.method === "GET") {
        const r = await db
          .prepare("SELECT id, expr, result, ts FROM history WHERE bot_id = ? AND user_id = ? ORDER BY id DESC LIMIT ?")
          .bind(botId, auth.user.id, limit)
          .all<{ id: number; expr: string; result: string; ts: number }>();
        return json({ items: r.results, limit, is_pro: isPro });
      }
      if (req.method === "DELETE") {
        await db.prepare("DELETE FROM history WHERE bot_id = ? AND user_id = ?").bind(botId, auth.user.id).run();
        return json({ ok: true });
      }
      const v = validate(await readJson(req), HISTORY_SPEC, { required: ["expr", "result"] });
      if (!v.ok) throw new HttpError(400, "bad_request", v.error);
      if (row.keep_history !== 1) throw new HttpError(409, "history_off", "history sync is disabled in settings");
      await db
        .prepare("INSERT INTO history (bot_id, user_id, expr, result, ts) VALUES (?, ?, ?, ?, ?)")
        .bind(botId, auth.user.id, v.value.expr, v.value.result, now)
        .run();
      // keep only the newest `limit` rows of this user
      await db
        .prepare(
          "DELETE FROM history WHERE bot_id = ? AND user_id = ? AND id NOT IN (SELECT id FROM history WHERE bot_id = ? AND user_id = ? ORDER BY id DESC LIMIT ?)",
        )
        .bind(botId, auth.user.id, botId, auth.user.id, limit)
        .run();
      return json({ ok: true }, 201);
    }

    case "invoice": {
      if (isPro) throw new HttpError(409, "already_pro");
      const s = toSettings(row);
      const lang = s.lang ?? detectLang(auth.user.language_code, config.defaultLang);
      const stars = botProConfig(auth.bot).proStars;
      const link = await createInvoice({
        fetchFn: deps.fetchFn ?? globalFetch,
        token: auth.token,
        bot: auth.bot,
        userId: auth.user.id,
        lang,
        stars,
      });
      return json({ link, stars });
    }
  }
  throw new HttpError(404, "not_found");
}
