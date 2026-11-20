// Exchange-rate download. Source 1: Central Bank of Uzbekistan (no key). Fallback: open.er-api.com (USD base).
// Every failure (network, timeout, size, shape) yields null; nothing here throws.

import { Decimal, type FxRates } from "../calc";

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  text(): Promise<string>;
}
export type FetchFn = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<FetchResponseLike>;

export const CBU_URL = "https://cbu.uz/oz/arkhiv-kursov-valyut/json/";
export const ER_API_URL = "https://open.er-api.com/v6/latest/USD";
export const MAX_BODY_BYTES = 200 * 1024;
export const FETCH_TIMEOUT_MS = 5000;

export interface FetchOptions {
  timeoutMs?: number;
  /** Clock in Unix seconds (default: Date.now()/1000). */
  now?: () => number;
}

const CODE_RE = /^[A-Z]{3}$/;
const POS_NUM_RE = /^\d+(?:\.\d+)?$/;

async function getJson(fetchFn: FetchFn, url: string, timeoutMs: number): Promise<unknown> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, rej) => {
      timer = setTimeout(() => {
        ctl.abort();
        rej(new Error("timeout"));
      }, timeoutMs);
    });
    const work = (async () => {
      const res = await fetchFn(url, { signal: ctl.signal, headers: { accept: "application/json" } });
      if (!res || !res.ok) throw new Error("http");
      const len = Number(res.headers?.get("content-length") ?? "0");
      if (Number.isFinite(len) && len > MAX_BODY_BYTES) throw new Error("too large");
      const body = await res.text();
      if (typeof body !== "string" || body.length > MAX_BODY_BYTES) throw new Error("too large");
      return JSON.parse(body) as unknown;
    })();
    work.catch(() => undefined); // a late failure after a timeout must not become an unhandled rejection
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Sample: [{"id":68,"Code":"840","Ccy":"USD","Nominal":"1","Rate":"11971.64","Diff":"-8.72","Date":"20.11.2026",...}]. Rate = UZS per Nominal units. */
export function parseCbu(data: unknown, now: number): FxRates | null {
  if (!Array.isArray(data) || data.length < 5 || data.length > 500) return null;
  const rates: Record<string, string> = { UZS: "1" };
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const ccy = o.Ccy;
    const rate = typeof o.Rate === "number" ? String(o.Rate) : o.Rate;
    const nominal = typeof o.Nominal === "number" ? String(o.Nominal) : o.Nominal;
    if (typeof ccy !== "string" || !CODE_RE.test(ccy) || typeof rate !== "string" || typeof nominal !== "string") continue;
    if (!POS_NUM_RE.test(rate) || !POS_NUM_RE.test(nominal)) continue;
    try {
      const r = Decimal.parse(rate);
      const n = Decimal.parse(nominal);
      if (r.sign() <= 0 || n.sign() <= 0) continue;
      rates[ccy] = n.div(r).toString(); // units of ccy per 1 UZS
    } catch {
      continue;
    }
  }
  if (!rates.USD || Object.keys(rates).length < 5) return null;
  return { base: "UZS", rates, updatedAt: now, source: "cbu" };
}

/** Sample: {"result":"success","base_code":"USD","rates":{"USD":1,"AED":3.6725,...}}. */
export function parseErApi(data: unknown, now: number): FxRates | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (o.result !== "success" || o.base_code !== "USD" || !o.rates || typeof o.rates !== "object") return null;
  const src = o.rates as Record<string, unknown>;
  const keys = Object.keys(src);
  if (keys.length > 500) return null;
  const rates: Record<string, string> = {};
  for (const k of keys) {
    const v = src[k];
    if (!CODE_RE.test(k) || typeof v !== "number" || !Number.isFinite(v) || v <= 0) continue;
    try {
      rates[k] = Decimal.parse(String(v)).toString();
    } catch {
      continue;
    }
  }
  if (!rates.USD || Object.keys(rates).length < 5) return null;
  return { base: "USD", rates, updatedAt: now, source: "er-api" };
}

export async function fetchRates(fetchFn: FetchFn, opts: FetchOptions = {}): Promise<FxRates | null> {
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const nowFn = opts.now ?? (() => Math.floor(Date.now() / 1000));
  try {
    const cbu = parseCbu(await getJson(fetchFn, CBU_URL, timeoutMs), nowFn());
    if (cbu) return cbu;
  } catch {
    // fall through to the backup source
  }
  try {
    return parseErApi(await getJson(fetchFn, ER_API_URL, timeoutMs), nowFn());
  } catch {
    return null;
  }
}
