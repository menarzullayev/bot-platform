import type { Db } from "./db";

export const LANGS = ["uz-latn", "uz-cyrl", "ru", "en", "tr", "ar", "es"] as const;
export type Lang = (typeof LANGS)[number];
export const LOG_LEVELS = ["error", "warn", "info", "debug"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Env {
  DB: D1Database;
  /** Static assets binding for the Mini App (wrangler.toml [assets]); absent in unit tests. */
  ASSETS?: Fetcher;
  // secret (wrangler secret put)
  TOKEN_KEY: string;
  ADMIN_TOKEN: string;
  TOKEN_KEY_PREV?: string;
  FX_API_KEY?: string;
  // oddiy sozlama (wrangler.toml [vars] yoki .dev.vars)
  APP_ENV?: string;
  PUBLIC_BASE_URL?: string;
  LOG_LEVEL?: string;
  INITDATA_MAX_AGE_S?: string;
  DEFAULT_LANG?: string;
}

/** Test/qo'shimcha bog'liqliklar: ishlab chiqarishda bo'sh qoladi. */
export interface Deps {
  db?: Db;
  fetchFn?: typeof fetch;
  configureBot?: (bot: import("grammy").Bot) => void;
  now?: () => number;
}

export interface AppConfig {
  appEnv: "local" | "production";
  publicBaseUrl: string | null;
  logLevel: LogLevel;
  initDataMaxAgeS: number;
  defaultLang: Lang;
}

function isKey32(v: string): boolean {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(v)) return false;
  try {
    return atob(v).length === 32;
  } catch {
    return false;
  }
}

/**
 * Muhitni tekshiradi. Qiymatlarning o'zi hech qachon xatoga yozilmaydi,
 * faqat o'zgaruvchi nomi va qoida.
 */
export function validateEnv(env: Partial<Env>): { ok: true; config: AppConfig } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!env.DB) errors.push("DB: D1 binding yo'q");
  if (!env.TOKEN_KEY || !isKey32(env.TOKEN_KEY)) errors.push("TOKEN_KEY: 32 bayt base64 bo'lishi kerak");
  if (env.TOKEN_KEY_PREV !== undefined && env.TOKEN_KEY_PREV !== "" && !isKey32(env.TOKEN_KEY_PREV))
    errors.push("TOKEN_KEY_PREV: 32 bayt base64 bo'lishi kerak");
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32) errors.push("ADMIN_TOKEN: kamida 32 belgi");

  const appEnv = env.APP_ENV ?? "production";
  if (appEnv !== "local" && appEnv !== "production") errors.push("APP_ENV: local yoki production");

  const logLevel = env.LOG_LEVEL ?? "info";
  if (!(LOG_LEVELS as readonly string[]).includes(logLevel)) errors.push("LOG_LEVEL: " + LOG_LEVELS.join("|"));

  const defaultLang = env.DEFAULT_LANG ?? "uz-latn";
  if (!(LANGS as readonly string[]).includes(defaultLang)) errors.push("DEFAULT_LANG: " + LANGS.join("|"));

  const maxAge = Number(env.INITDATA_MAX_AGE_S ?? "3600");
  if (!Number.isInteger(maxAge) || maxAge < 60 || maxAge > 86400) errors.push("INITDATA_MAX_AGE_S: 60..86400 butun son");

  let publicBaseUrl: string | null = null;
  if (env.PUBLIC_BASE_URL) {
    try {
      const u = new URL(env.PUBLIC_BASE_URL);
      const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
      if (u.protocol !== "https:" && !(local && u.protocol === "http:")) errors.push("PUBLIC_BASE_URL: https bo'lishi kerak");
      if (env.PUBLIC_BASE_URL.endsWith("/")) errors.push("PUBLIC_BASE_URL: oxirida / bo'lmasin");
      publicBaseUrl = env.PUBLIC_BASE_URL;
    } catch {
      errors.push("PUBLIC_BASE_URL: noto'g'ri URL");
    }
  } else if (appEnv === "production") {
    errors.push("PUBLIC_BASE_URL: productionda majburiy");
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    config: {
      appEnv: appEnv as AppConfig["appEnv"],
      publicBaseUrl,
      logLevel: logLevel as LogLevel,
      initDataMaxAgeS: maxAge,
      defaultLang: defaultLang as Lang,
    },
  };
}
