// Isolate-local, best-effort memory: `ans` per user, the "this is not math" hint throttle and the FX table cache.
// Nothing here touches D1; every structure is bounded.

import { Decimal, type FxRates } from "../../calc";
import type { Db } from "../../db";
import { loadRates } from "../../fx/store";

/** Insertion-ordered map capped at `max` entries; reading refreshes recency. */
export class Lru<V> {
  private m = new Map<string, V>();
  constructor(private readonly max: number) {}

  get(key: string): V | undefined {
    const v = this.m.get(key);
    if (v === undefined) return undefined;
    this.m.delete(key);
    this.m.set(key, v);
    return v;
  }

  set(key: string, value: V): void {
    this.m.delete(key);
    this.m.set(key, value);
    while (this.m.size > this.max) {
      const first = this.m.keys().next().value;
      if (first === undefined) break;
      this.m.delete(first);
    }
  }

  delete(key: string): void {
    this.m.delete(key);
  }

  clear(): void {
    this.m.clear();
  }

  get size(): number {
    return this.m.size;
  }
}

const ans = new Lru<string>(2000);
const hints = new Lru<number>(5000);
const rateCache = new WeakMap<object, { rates: FxRates; at: number }>();

/** Seconds between two "this is not a calculation" hints to the same user. */
export const HINT_INTERVAL_S = 20 * 60;
/** Seconds a loaded FX table is reused inside one isolate. */
export const RATES_CACHE_TTL_S = 10 * 60;

const ansKey = (botId: string, userId: number) => `${botId}:${userId}`;

export function getAns(botId: string, userId: number): Decimal | undefined {
  const s = ans.get(ansKey(botId, userId));
  if (s === undefined) return undefined;
  try {
    return Decimal.parse(s);
  } catch {
    return undefined;
  }
}

export function setAns(botId: string, userId: number, value: Decimal): void {
  ans.set(ansKey(botId, userId), value.toString());
}

export function clearAns(botId: string, userId: number): void {
  ans.delete(ansKey(botId, userId));
}

/** True when a hint may be shown now (and records it); false when one was shown within HINT_INTERVAL_S. */
export function takeHint(botId: string, userId: number, nowS: number): boolean {
  const key = ansKey(botId, userId);
  const last = hints.get(key);
  if (last !== undefined && nowS - last < HINT_INTERVAL_S) return false;
  hints.set(key, nowS);
  return true;
}

/** FX table with a short in-isolate cache so currency conversions do not read ~170 rows every time. */
export async function getRatesCached(db: Db, nowS: number): Promise<FxRates | null> {
  const hit = rateCache.get(db as unknown as object);
  if (hit && nowS - hit.at < RATES_CACHE_TTL_S && nowS >= hit.at) return hit.rates;
  const rates = await loadRates(db);
  if (rates) rateCache.set(db as unknown as object, { rates, at: nowS });
  return rates;
}

export function invalidateRates(db: Db): void {
  rateCache.delete(db as unknown as object);
}

/** Test hook. */
export function resetMemory(): void {
  ans.clear();
  hints.clear();
}
