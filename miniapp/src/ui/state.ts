// Shared application state (a plain object plus change listeners) and the guarded localStorage cache.

import type { FxRates } from "../../../worker/src/calc/currency";
import type { Api } from "../lib/api";
import { tr, type Lang, type MessageKey, type MsKey } from "../i18n";
import type { Prefs } from "../lib/num";

export type ThemePref = "auto" | "light" | "dark";

export interface AppState {
  lang: Lang;
  angle: "deg" | "rad";
  digits: number;
  keepHistory: boolean;
  theme: ThemePref;
  isPro: boolean;
  proUntil: number;
  proStars: number;
  historyLimit: number;
  /** telegram = signed initData present; demo = plain browser (local-only features). */
  mode: "telegram" | "demo";
  /** Set when the server rejected our initData (shown as a banner). */
  authError: "err_auth" | "err_expired" | null;
  botId: string | null;
  api: Api | null;
  rates: (FxRates & { stale: boolean }) | null;
  ratesStatus: "idle" | "loading" | "ok" | "error";
}

export const state: AppState = {
  lang: "uz-latn",
  angle: "deg",
  digits: 12,
  keepHistory: false,
  theme: "auto",
  isPro: false,
  proUntil: 0,
  proStars: 150,
  historyLimit: 20,
  mode: "demo",
  authError: null,
  botId: null,
  api: null,
  rates: null,
  ratesStatus: "idle",
};

type Listener = (changed: ReadonlyArray<keyof AppState>) => void;
const listeners = new Set<Listener>();

export function onChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function update(patch: Partial<AppState>): void {
  const changed: Array<keyof AppState> = [];
  for (const k of Object.keys(patch) as Array<keyof AppState>) {
    if (state[k] !== patch[k]) {
      (state as unknown as Record<string, unknown>)[k] = patch[k];
      changed.push(k);
    }
  }
  if (changed.length) for (const fn of [...listeners]) fn(changed);
}

export const prefs = (): Prefs => ({ lang: state.lang, angle: state.angle, digits: state.digits });

/** Translate in the current language. */
export const t = (key: MsKey | MessageKey, params?: Record<string, string | number>): string => tr(state.lang, key, params);

// ---- localStorage (may throw or be absent: private mode, blocked storage, thumbnails) ----

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem("tc:" + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function lsSet(key: string, value: unknown): void {
  try {
    window.localStorage.setItem("tc:" + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the app keeps working without persistence */
  }
}

export interface StoredPrefs {
  lang?: Lang;
  angle?: "deg" | "rad";
  digits?: number;
  keepHistory?: boolean;
  theme?: ThemePref;
}

export function persistPrefs(): void {
  lsSet("prefs", { lang: state.lang, angle: state.angle, digits: state.digits, keepHistory: state.keepHistory, theme: state.theme } satisfies StoredPrefs);
}
