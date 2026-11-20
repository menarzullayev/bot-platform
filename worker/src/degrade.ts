// Degradation levels (DEC-013): stay on the free Workers plan by switching expensive features off as the daily
// request count approaches the limit.
//   level 0: everything on
//   level 1: share-card creation off
//   level 2: also server-side history writes and settings writes off (the Mini App keeps working locally)
// Plain calculation, inline and guest mode never degrade.

import type { Db } from "./db";
import { DEFAULT_DEGRADE_L1, DEFAULT_DEGRADE_L2, type AppConfig } from "./env";
import { errInfo, log } from "./log";
import { dayOf, pendingSum } from "./metrics";

export type DegradeLevel = 0 | 1 | 2;

/** How long the D1 total of today's `req` is reused inside one isolate. */
export const CACHE_MS = 60_000;

export interface Thresholds {
  l1: number;
  l2: number;
}

export function thresholdsOf(cfg?: Pick<AppConfig, "degradeL1" | "degradeL2">): Thresholds {
  return { l1: cfg?.degradeL1 ?? DEFAULT_DEGRADE_L1, l2: cfg?.degradeL2 ?? DEFAULT_DEGRADE_L2 };
}

export function levelFor(total: number, th: Thresholds): DegradeLevel {
  return total >= th.l2 ? 2 : total >= th.l1 ? 1 : 0;
}

interface Cached {
  day: string;
  /** ms of the last load attempt (successful or not). */
  at: number;
  total: number;
  loading: Promise<void> | null;
}
const cache = new WeakMap<object, Cached>();

/**
 * Level from the last known D1 total of today's `req` plus what this isolate counted but has not flushed yet.
 * Synchronous and free: it never reads D1, so hot paths (webhook, /me, /settings) keep their D1 budget.
 * Before the first refresh of an isolate only the local part is known (fail open: level 0 is the safe side).
 */
export function peekDegradation(db: Db, nowSec: number, cfg?: Pick<AppConfig, "degradeL1" | "degradeL2">): DegradeLevel {
  const day = dayOf(nowSec * 1000);
  const c = cache.get(db);
  const known = c && c.day === day ? c.total : 0;
  return levelFor(known + pendingSum(db, day, "req"), thresholdsOf(cfg));
}

/**
 * Re-reads today's total from D1 when the cached one is older than CACHE_MS (or from another day). Returns the
 * running load (for ctx.waitUntil) or null when nothing is needed. One D1 read per minute per isolate, off the
 * request path. Never rejects: on failure the last known total stays.
 */
export function refreshIfStale(db: Db, nowSec: number): Promise<void> | null {
  const nowMs = nowSec * 1000;
  const day = dayOf(nowMs);
  const c = cache.get(db);
  if (c?.loading) return c.loading;
  if (c && c.day === day && nowMs - c.at < CACHE_MS && nowMs >= c.at) return null;
  const prev = c && c.day === day ? c.total : 0;
  const entry: Cached = { day, at: nowMs, total: prev, loading: null };
  entry.loading = (async () => {
    await null;
    try {
      const r = await db
        .prepare("SELECT COALESCE(SUM(n), 0) AS n FROM metrics_daily WHERE day = ? AND key = 'req'")
        .bind(day)
        .first<{ n: number }>();
      entry.total = Number(r?.n ?? 0);
    } catch (e) {
      log("debug", "degrade: reading today's total failed, using the last known value", { error: errInfo(e) });
    } finally {
      entry.loading = null;
    }
  })();
  cache.set(db, entry);
  return entry.loading;
}

/** Awaited variant: refreshes when stale, then answers. Never throws. `nowSec` is Unix seconds. */
export async function getDegradation(db: Db, nowSec: number, cfg?: Pick<AppConfig, "degradeL1" | "degradeL2">): Promise<DegradeLevel> {
  const r = refreshIfStale(db, nowSec);
  if (r) await r;
  return peekDegradation(db, nowSec, cfg);
}

/** Seconds until the counter resets (next 00:00 UTC), for Retry-After. */
export function secondsUntilReset(nowSec: number): number {
  return 86_400 - (nowSec % 86_400);
}

/** Test hook. */
export function resetDegradation(db: Db): void {
  cache.delete(db);
}
