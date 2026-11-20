// Server session: entitlement/settings (/me) and exchange rates (/fx), plus history sync.

import { ApiError, type HistoryItem } from "../lib/api";
import { parseFxPayload } from "../lib/convert";
import { isLang, type Lang } from "../i18n";
import { lsGet, lsSet, persistPrefs, state, update } from "./state";

let ratesPromise: Promise<void> | null = null;

/** Loads (once) the public rate table; failures leave ratesStatus = "error" and units keep working. */
export function ensureRates(force = false): Promise<void> {
  if (!state.api) {
    update({ ratesStatus: "error" });
    return Promise.resolve();
  }
  if (ratesPromise && !force) return ratesPromise;
  update({ ratesStatus: "loading" });
  const api = state.api;
  ratesPromise = api
    .fx()
    .then((p) => {
      const rates = parseFxPayload(p);
      update({ rates, ratesStatus: rates ? "ok" : "error" });
    })
    .catch(() => {
      update({ ratesStatus: "error" });
      ratesPromise = null;
    });
  return ratesPromise;
}

/** Fetches entitlement and server-side settings. Returns false when authentication failed. */
export async function refreshMe(applyLang = false): Promise<boolean> {
  const api = state.api;
  if (!api || state.mode !== "telegram") return false;
  try {
    const me = await api.me();
    const patch: Parameters<typeof update>[0] = {
      isPro: me.pro.is_pro,
      proUntil: me.pro.pro_until,
      proStars: me.pro_stars,
      historyLimit: me.limits.history,
      angle: me.settings.angle,
      digits: me.settings.digits,
      keepHistory: me.settings.keep_history,
      authError: null,
    };
    if (applyLang && isLang(me.lang)) patch.lang = me.lang as Lang;
    update(patch);
    persistPrefs();
    return true;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 404 || e.status === 403)) {
      update({ authError: e.code === "auth_expired" ? "err_expired" : "err_auth" });
    }
    return false;
  }
}

// ---- history ----

export interface LocalItem {
  expr: string;
  result: string;
  ts: number;
}

const histKey = (): string => "hist:" + (state.botId ?? "demo");

export function localHistory(): LocalItem[] {
  return lsGet<LocalItem[]>(histKey(), []).slice(0, state.historyLimit);
}

export function pushHistory(expr: string, result: string): LocalItem[] {
  const items = [{ expr, result, ts: Math.floor(Date.now() / 1000) }, ...localHistory().filter((i) => !(i.expr === expr && i.result === result))].slice(0, state.historyLimit);
  lsSet(histKey(), items);
  if (state.keepHistory && state.api && state.mode === "telegram" && !state.authError) {
    void state.api.addHistory(expr, result).catch(() => undefined);
  }
  return items;
}

export function clearHistoryAll(): void {
  lsSet(histKey(), []);
  if (state.api && state.mode === "telegram" && !state.authError) void state.api.clearHistory().catch(() => undefined);
}

/** With sync on, the server list replaces the local cache. */
export async function syncHistory(): Promise<LocalItem[]> {
  if (!(state.keepHistory && state.api && state.mode === "telegram" && !state.authError)) return localHistory();
  try {
    const r = await state.api.history();
    const items = r.items.map((i: HistoryItem) => ({ expr: i.expr, result: i.result, ts: i.ts }));
    lsSet(histKey(), items);
    return items.slice(0, state.historyLimit);
  } catch {
    return localHistory();
  }
}

export interface SettingsPatch {
  angle?: "deg" | "rad";
  digits?: number;
  keepHistory?: boolean;
  lang?: Lang;
}

/** Applies a settings change locally at once and mirrors it to the server when signed in. Returns false when the server refused. */
export async function saveSettings(patch: SettingsPatch): Promise<boolean> {
  update(patch);
  persistPrefs();
  if (!state.api || state.mode !== "telegram" || state.authError) return true;
  const body: { angle?: "deg" | "rad"; digits?: number; keep_history?: boolean; lang?: string } = {};
  if (patch.angle !== undefined) body.angle = patch.angle;
  if (patch.digits !== undefined) body.digits = patch.digits;
  if (patch.keepHistory !== undefined) body.keep_history = patch.keepHistory;
  if (patch.lang !== undefined) body.lang = patch.lang;
  try {
    await state.api.saveSettings(body);
    return true;
  } catch {
    return false;
  }
}
