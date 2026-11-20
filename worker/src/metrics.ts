// Aggregated, anonymous daily counters (DEC-015) kept in isolate memory and flushed to D1 in batches.
//
// Privacy by construction: the only inputs are (UTC day, bot id, key, n). Keys come from a closed whitelist
// (isValidKey), so a user id, a calculation or any free text can never reach storage. There is no per-user key.
//
// Budget: count() is a synchronous in-memory increment. A flush writes one upsert per DISTINCT (day, bot, key)
// pending, so 25+ events collapse into a handful of rows (with only `req` pending that is 1 write per 25 events).

import type { Db, Stmt } from "./db";
import { errInfo, log } from "./log";

/** Flush when this many events are pending ... */
export const FLUSH_EVENTS = 25;
/** ... or when the oldest pending event is this old (checked on the next request/cron, not by a timer). */
export const FLUSH_AGE_MS = 60_000;
/** After a failed flush wait this long before trying again (D1 down must not turn into a retry storm). */
export const FLUSH_RETRY_MS = 30_000;
/** Hard cap of distinct pending keys per isolate (memory bound); new keys beyond it are dropped. */
export const MAX_PENDING_KEYS = 500;
/** Bot id used for platform-level counters (cards, unattributed requests). */
export const PLATFORM_BOT = "-";

const BOT_RE = /^(?:-|[A-Za-z0-9_-]{1,32})$/;
const FUNCTIONS = ["calc", "convert", "loan", "vat", "inline", "guest", "solve", "derive", "integrate"] as const;
export type FunctionKey = (typeof FUNCTIONS)[number];
// Closed whitelist. `au` is deliberately absent: it is written as an absolute value by setMetric(), never counted.
const KEY_RE = new RegExp(
  "^(?:req|app:open|f:(?:" +
    FUNCTIONS.join("|") +
    ")|style:[a-z][a-z0-9_-]{0,31}|lang:[a-z]{2,3}(?:-[a-z]{2,8})?|pro:(?:view|buy)|card:(?:create|view))$",
);

export const isValidKey = (key: unknown): key is string => typeof key === "string" && KEY_RE.test(key);
export const isValidBotId = (id: unknown): id is string => typeof id === "string" && BOT_RE.test(id);

const SEP = "\u0000";

/** UTC calendar day, YYYY-MM-DD. */
export function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Unix seconds of 00:00 UTC of the day that contains `ms`. */
export function dayStartSec(ms: number): number {
  return Math.floor(ms / 86_400_000) * 86_400;
}

export interface WaitUntil {
  waitUntil(p: Promise<unknown>): void;
}

interface State {
  counts: Map<string, number>;
  events: number;
  oldestMs: number | null;
  /** Snapshot being written right now; still counted by pendingSum until D1 confirms. */
  inflight: Map<string, number> | null;
  flushing: Promise<number> | null;
  retryAtMs: number;
}

const states = new WeakMap<object, State>();

function stateOf(db: object): State {
  let s = states.get(db);
  if (!s) {
    s = { counts: new Map(), events: 0, oldestMs: null, inflight: null, flushing: null, retryAtMs: 0 };
    states.set(db, s);
  }
  return s;
}

export interface CountOpts {
  nowMs?: number;
  /** When given, a due flush is scheduled through ctx.waitUntil. */
  ctx?: WaitUntil;
}

/**
 * Adds `n` to the counter (day = today UTC). Synchronous and never throws; invalid input is ignored.
 * Returns false when the input was rejected (bad bot id, key outside the whitelist, bad n, memory cap).
 */
export function count(db: Db, botId: string, key: string, n = 1, o: CountOpts = {}): boolean {
  if (!isValidBotId(botId) || !isValidKey(key) || !Number.isSafeInteger(n) || n < 1 || n > 1_000_000) return false;
  const nowMs = o.nowMs ?? Date.now();
  const s = stateOf(db);
  const k = dayOf(nowMs) + SEP + botId + SEP + key;
  if (!s.counts.has(k) && s.counts.size >= MAX_PENDING_KEYS) return false;
  s.counts.set(k, (s.counts.get(k) ?? 0) + n);
  s.events += n;
  s.oldestMs ??= nowMs;
  if (o.ctx) {
    const p = flushIfDue(db, nowMs);
    if (p) o.ctx.waitUntil(p);
  }
  return true;
}

/** Sum of today's not-yet-confirmed counts of `key` over all bots (pending + in flight). */
export function pendingSum(db: Db, day: string, key: string): number {
  const s = states.get(db);
  if (!s) return 0;
  let total = 0;
  const add = (m: Map<string, number> | null) => {
    if (!m) return;
    for (const [k, n] of m) {
      const [d, , kk] = k.split(SEP);
      if (d === day && kk === key) total += n;
    }
  };
  add(s.counts);
  add(s.inflight);
  return total;
}

/** Pending events (not yet in D1), for tests and diagnostics. */
export function pendingEvents(db: Db): number {
  return states.get(db)?.events ?? 0;
}

export function isDue(db: Db, nowMs = Date.now()): boolean {
  const s = states.get(db);
  if (!s || s.events === 0 || s.flushing || nowMs < s.retryAtMs) return false;
  return s.events >= FLUSH_EVENTS || (s.oldestMs !== null && nowMs - s.oldestMs >= FLUSH_AGE_MS);
}

/** Starts a flush when the thresholds say so; returns its promise (for waitUntil) or null when nothing is due. */
export function flushIfDue(db: Db, nowMs = Date.now()): Promise<number> | null {
  return isDue(db, nowMs) ? flushMetrics(db, nowMs) : null;
}

const UPSERT =
  "INSERT INTO metrics_daily (day, bot_id, key, n) VALUES (?, ?, ?, ?) ON CONFLICT(day, bot_id, key) DO UPDATE SET n = n + excluded.n";
const BATCH_MAX = 50;

async function runStatements(db: Db, stmts: Stmt[]): Promise<void> {
  const batch = (db as unknown as { batch?: (s: Stmt[]) => Promise<unknown> }).batch;
  if (typeof batch === "function") {
    for (let i = 0; i < stmts.length; i += BATCH_MAX) await batch.call(db, stmts.slice(i, i + BATCH_MAX));
    return;
  }
  for (const s of stmts) await s.run();
}

/**
 * Writes every pending counter to D1 (one upsert per distinct key, D1 batch when available). Never throws:
 * on failure the counts are put back and a retry is postponed. Returns the number of statements written.
 */
export function flushMetrics(db: Db, nowMs = Date.now()): Promise<number> {
  const s = stateOf(db);
  if (s.flushing) return s.flushing;
  if (s.counts.size === 0) return Promise.resolve(0);
  const snapshot = s.counts;
  s.inflight = snapshot;
  s.counts = new Map();
  s.events = 0;
  s.oldestMs = null;
  const run = (async (): Promise<number> => {
    await null; // always yield once, so `s.flushing = run` below is set before the finally block can clear it
    try {
      const stmts: Stmt[] = [];
      for (const [k, n] of snapshot) {
        const [day, bot, key] = k.split(SEP);
        stmts.push(db.prepare(UPSERT).bind(day, bot, key, n));
      }
      await runStatements(db, stmts);
      return stmts.length;
    } catch (e) {
      // put the counts back (merging with what arrived meanwhile) so nothing is lost on a transient D1 error
      for (const [k, n] of snapshot) {
        if (s.counts.has(k) || s.counts.size < MAX_PENDING_KEYS) {
          s.counts.set(k, (s.counts.get(k) ?? 0) + n);
          s.events += n;
        }
      }
      s.oldestMs ??= nowMs;
      s.retryAtMs = nowMs + FLUSH_RETRY_MS;
      log("warn", "metrics: flush failed, will retry", { error: errInfo(e) });
      return 0;
    } finally {
      s.inflight = null;
      s.flushing = null;
    }
  })();
  s.flushing = run;
  return run;
}

/** Overwrites one counter with an absolute value (idempotent). Used for `au`, computed by the cron. */
export async function setMetric(db: Db, day: string, botId: string, key: string, n: number): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isValidBotId(botId) || !(key === "au" || isValidKey(key))) {
    throw new Error("metrics: bad setMetric input");
  }
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("metrics: bad setMetric value");
  await db
    .prepare(
      "INSERT INTO metrics_daily (day, bot_id, key, n) VALUES (?, ?, ?, ?) ON CONFLICT(day, bot_id, key) DO UPDATE SET n = excluded.n",
    )
    .bind(day, botId, key, n)
    .run();
}

/** Distinct users of this bot whose settings row changed since `sinceSec` (the cron's daily `au` input). */
export async function activeUsersSince(db: Db, botId: string, sinceSec: number): Promise<number> {
  const r = await db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE bot_id = ? AND updated_at >= ?")
    .bind(botId, sinceSec)
    .first<{ n: number }>();
  return Number(r?.n ?? 0);
}

export interface MetricRow {
  day: string;
  bot_id: string;
  key: string;
  n: number;
}

/** Rows of [from, to] (inclusive UTC days), optionally for one bot. */
export async function readRange(db: Db, from: string, to: string, botId?: string): Promise<MetricRow[]> {
  const base = "SELECT day, bot_id, key, n FROM metrics_daily WHERE day >= ? AND day <= ?";
  const st = botId
    ? db.prepare(base + " AND bot_id = ? ORDER BY day, bot_id, key").bind(from, to, botId)
    : db.prepare(base + " ORDER BY day, bot_id, key").bind(from, to);
  return (await st.all<MetricRow>()).results ?? [];
}

/** Test hook: forget pending state of a db. */
export function resetMetrics(db: Db): void {
  states.delete(db);
}
