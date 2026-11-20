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
  /** DEC-013 degradation level: 0 = everything on, 1 = share cards off, 2 = server writes off too. Absent on old servers. */
  degraded?: number;
}

/** Answer of POST /card. `prepared_id` is null when Telegram refused to prepare the message (the URL still works). */
export interface CardResponse {
  id: string;
  url: string;
  prepared_id: string | null;
  prepared_expires_at: number | null;
  expires_at: number;
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
  /** Uploads a share-card JPEG (<= 64 KB) with an optional plain-text caption. */
  card(jpeg: Blob, caption: string): Promise<CardResponse>;
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

  async function call<T>(path: string, init: { method?: string; body?: unknown; raw?: { body: Blob; type: string; headers?: Record<string, string> } } = {}, auth = true): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (auth) headers.authorization = `tma ${o.initData}`;
    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (init.raw) Object.assign(headers, init.raw.headers, { "content-type": init.raw.type });
    const f = o.fetchFn ?? globalThis.fetch.bind(globalThis);
    const res = await f(root + path, {
      method: init.method ?? "GET",
      headers,
      body: init.raw ? init.raw.body : init.body === undefined ? undefined : JSON.stringify(init.body),
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
    card: (jpeg, caption) =>
      call<CardResponse>("/card", { method: "POST", raw: { body: jpeg, type: "image/jpeg", headers: caption ? { "x-card-caption": encodeURIComponent(caption) } : undefined } }),
  };
}
