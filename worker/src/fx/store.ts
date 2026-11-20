// Persistence of the rate table in D1 (fx_rates: base, quote, rate, updated_at, source).

import { Decimal, type FxRates } from "../calc";
import type { Db, Stmt } from "../db";

/** Seconds without a refresh after which a table counts as stale (36 hours). */
export const DEFAULT_MAX_AGE_S = 36 * 3600;
// D1 allows 100 bound parameters per statement; 5 columns per row.
const ROWS_PER_STMT = 19;

interface BatchCapable {
  batch?(stmts: Stmt[]): Promise<unknown>;
}

/** Replace the stored table with `rates` (rows of a different base are removed). `now` is Unix seconds. */
export async function saveRates(db: Db, rates: FxRates, source: string, now: number): Promise<void> {
  const quotes = Object.keys(rates.rates);
  const stmts: Stmt[] = [];
  for (let i = 0; i < quotes.length; i += ROWS_PER_STMT) {
    const chunk = quotes.slice(i, i + ROWS_PER_STMT);
    const values = chunk.map(() => "(?, ?, ?, ?, ?)").join(", ");
    const args: unknown[] = [];
    for (const q of chunk) args.push(rates.base, q, rates.rates[q], now, source);
    stmts.push(db.prepare(`INSERT OR REPLACE INTO fx_rates (base, quote, rate, updated_at, source) VALUES ${values}`).bind(...args));
  }
  stmts.push(db.prepare("DELETE FROM fx_rates WHERE base != ?").bind(rates.base));
  const b = (db as Db & BatchCapable).batch;
  if (typeof b === "function") await b.call(db, stmts);
  else for (const s of stmts) await s.run();
}

interface Row {
  base: string;
  quote: string;
  rate: string;
  updated_at: number;
  source: string | null;
}

/** Load the freshest table (rows of the newest base); null when empty. */
export async function loadRates(db: Db): Promise<FxRates | null> {
  const r = await db.prepare("SELECT base, quote, rate, updated_at, source FROM fx_rates").all<Row>();
  const rows = r.results;
  if (!rows || rows.length === 0) return null;
  let newest = rows[0];
  for (const row of rows) if (row.updated_at > newest.updated_at) newest = row;
  const rates: Record<string, string> = {};
  for (const row of rows) {
    if (row.base !== newest.base || typeof row.rate !== "string") continue;
    try {
      if (Decimal.parse(row.rate).sign() > 0) rates[row.quote] = row.rate;
    } catch {
      continue;
    }
  }
  if (Object.keys(rates).length === 0) return null;
  const out: FxRates = { base: newest.base, rates, updatedAt: newest.updated_at };
  if (newest.source) out.source = newest.source;
  return out;
}

/** True when the table is older than maxAgeS (or its timestamp is invalid). Both times are Unix seconds. */
export function isStale(rates: FxRates, now: number, maxAgeS: number = DEFAULT_MAX_AGE_S): boolean {
  if (!Number.isFinite(rates.updatedAt) || !Number.isFinite(now)) return true;
  return now - rates.updatedAt > maxAgeS;
}
