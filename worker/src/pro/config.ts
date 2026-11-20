/** Pro subscription constants and config. Pure: no I/O. */

/** The only subscription period the Bot API accepts (30 days, seconds). */
export const SUBSCRIPTION_PERIOD_S = 2_592_000;
export const DEFAULT_PRO_STARS = 150;
export const MIN_PRO_STARS = 1;
/** Bot API cap for a subscription price in Stars (docs/FACTS.md section 6). */
export const MAX_PRO_STARS = 10_000;
export const STARS_CURRENCY = "XTR";

/** Pro limits. Deliberately history-size only: there is no per-day quota anywhere. */
export const PRO_LIMITS = { freeHistory: 20, proHistory: 1000 } as const;

export function historyLimit(isPro: boolean): number {
  return isPro ? PRO_LIMITS.proHistory : PRO_LIMITS.freeHistory;
}

export interface CalcProConfig {
  /** Stars charged per 30-day period. */
  proStars: number;
}

/** Validates the `pro` part of a bot config; throws Error with a user-facing message. */
export function parseProConfig(raw: unknown): CalcProConfig {
  const c = (raw ?? {}) as { proStars?: unknown };
  if (c.proStars === undefined || c.proStars === null) return { proStars: DEFAULT_PRO_STARS };
  const n = c.proStars;
  if (typeof n !== "number" || !Number.isInteger(n) || n < MIN_PRO_STARS || n > MAX_PRO_STARS) {
    throw new Error(`proStars: ${MIN_PRO_STARS}..${MAX_PRO_STARS} oralig'ida butun son bo'lishi kerak`);
  }
  return { proStars: n };
}
