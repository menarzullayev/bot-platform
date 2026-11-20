// Typed client of the Mini App server API (worker/src/miniapp/api.ts). Same origin, so no CORS and no credentials.
// DOM-free: `fetch` is injectable for tests.

export const BOT_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

export interface Settings {
  angle: "deg" | "rad";
  digits: number;
  keep_history: boolean;
  /** Style and adaptation axes (null/absent = default). Values are validated by the client before use. */
  style?: string | null;
  contrast?: string | null;
  density?: string | null;
  lite?: string | null;
  fs?: string | null;
}

export interface MeResponse {
  user: { id: number; first_name: string; username?: string; language_code?: string };
  lang: string;
  pro: { is_pro: boolean; pro_until: number };
  settings: Settings;
  limits: { history: number };
  pro_stars: number;
}

export interface HistoryItem {
  id: number;
  expr: string;
  result: string;
  ts: number;
}

export interface FxPayload {
  base: string;
  rates: Record<string, string>;
  updated_at: number;
  source: string | null;
  stale: boolean;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export interface Api {
  me(): Promise<MeResponse>;
  fx(): Promise<FxPayload>;
  saveSettings(patch: Partial<Settings> & { lang?: string }): Promise<void>;
  history(): Promise<{ items: HistoryItem[]; limit: number; is_pro: boolean }>;
  addHistory(expr: string, result: string): Promise<void>;
  clearHistory(): Promise<void>;
  invoice(): Promise<{ link: string; stars: number }>;
}

export interface ApiOptions {
  /** Origin prefix, "" for same origin. */
  base?: string;
  botId: string;
  /** Telegram.WebApp.initData; empty = unauthenticated (only fx works). */
  initData: string;
  fetchFn?: typeof fetch;
}

export function createApi(o: ApiOptions): Api {
  if (!BOT_ID_RE.test(o.botId)) throw new Error("invalid bot id");
  const root = `${o.base ?? ""}/api/app/${o.botId}`;

  async function call<T>(path: string, init: { method?: string; body?: unknown } = {}, auth = true): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (auth) headers.authorization = `tma ${o.initData}`;
    if (init.body !== undefined) headers["content-type"] = "application/json";
    const f = o.fetchFn ?? globalThis.fetch.bind(globalThis);
    const res = await f(root + path, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const code = typeof (data as { error?: unknown } | null)?.error === "string" ? (data as { error: string }).error : "http_" + res.status;
      throw new ApiError(res.status, code);
    }
    return data as T;
  }

  return {
    me: () => call<MeResponse>("/me"),
    fx: () => call<FxPayload>("/fx", {}, false),
    saveSettings: async (patch) => {
      await call("/settings", { method: "POST", body: patch });
    },
    history: () => call("/history"),
    addHistory: async (expr, result) => {
      await call("/history", { method: "POST", body: { expr, result } });
    },
    clearHistory: async () => {
      await call("/history", { method: "DELETE" });
    },
    invoice: () => call("/invoice", { method: "POST" }),
  };
}
