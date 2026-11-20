export interface RateLimitOptions {
  /** Bucket size = burst allowed. */
  capacity: number;
  /** Time (ms) to refill a whole bucket. */
  windowMs: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitOptions = { capacity: 20, windowMs: 10_000 };

const MAX_KEYS = 10_000;

/** In-memory token bucket; state lives per isolate and is best-effort by design. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(private opts: RateLimitOptions = DEFAULT_RATE_LIMIT) {}

  /** Consumes one token; returns true when the key is over the limit. */
  limited(key: string, nowMs: number): boolean {
    const { capacity, windowMs } = this.opts;
    const b = this.buckets.get(key);
    let tokens: number;
    if (!b) {
      tokens = capacity;
    } else {
      tokens = Math.min(capacity, b.tokens + ((nowMs - b.at) * capacity) / windowMs);
    }
    const over = tokens < 1;
    // re-insert so Map order approximates least-recently-used
    this.buckets.delete(key);
    this.buckets.set(key, { tokens: over ? tokens : tokens - 1, at: nowMs });
    if (this.buckets.size > MAX_KEYS) this.prune(nowMs);
    return over;
  }

  private prune(nowMs: number): void {
    for (const [k, b] of this.buckets) {
      if (nowMs - b.at > this.opts.windowMs) this.buckets.delete(k);
      else break; // insertion order == recency order, the rest is newer
    }
    while (this.buckets.size > MAX_KEYS) {
      const first = this.buckets.keys().next().value;
      if (first === undefined) break;
      this.buckets.delete(first);
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}

export interface DedupOptions {
  maxEntries: number;
  ttlMs: number;
}

export const DEFAULT_DEDUP: DedupOptions = { maxEntries: 1000, ttlMs: 10 * 60_000 };

/** Per-bot LRU of recently seen update_id values with a TTL. */
export class UpdateDedup {
  private perBot = new Map<string, Map<number, number>>();
  constructor(private opts: DedupOptions = DEFAULT_DEDUP) {}

  /** Returns true if this update was already seen (and still remembered); otherwise records it. */
  isDuplicate(botId: string, updateId: number, nowMs: number): boolean {
    let seen = this.perBot.get(botId);
    if (!seen) {
      seen = new Map();
      this.perBot.set(botId, seen);
    }
    // expire from the oldest end; entries are kept in recency order with monotonic timestamps
    for (const [id, at] of seen) {
      if (nowMs - at > this.opts.ttlMs) seen.delete(id);
      else break;
    }
    const at = seen.get(updateId);
    const dup = at !== undefined && nowMs - at <= this.opts.ttlMs;
    seen.delete(updateId);
    seen.set(updateId, nowMs);
    while (seen.size > this.opts.maxEntries) {
      const oldest = seen.keys().next().value;
      if (oldest === undefined) break;
      seen.delete(oldest);
    }
    return dup;
  }
}

export interface PlatformState {
  limiter: RateLimiter;
  dedup: UpdateDedup;
}

export function createPlatformState(opts: { limiter?: RateLimitOptions; dedup?: DedupOptions } = {}): PlatformState {
  return { limiter: new RateLimiter(opts.limiter), dedup: new UpdateDedup(opts.dedup) };
}

const states = new WeakMap<object, PlatformState>();
let globalState: PlatformState | undefined;

/**
 * Isolate-local guard state, keyed by the DB binding object (stable per isolate in production,
 * fresh per FakeDb in tests, so tests do not leak update_ids into each other).
 */
export function platformStateFor(key: object | undefined): PlatformState {
  if (!key) return (globalState ??= createPlatformState());
  let s = states.get(key);
  if (!s) {
    s = createPlatformState();
    states.set(key, s);
  }
  return s;
}
