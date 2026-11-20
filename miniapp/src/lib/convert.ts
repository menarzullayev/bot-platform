// Converter logic: unit catalogue, currency list and conversion. Pure, DOM-free.

import { convertCurrency, listCurrencies, findCurrency, type FxRates } from "../../../worker/src/calc/currency";
import { Decimal } from "../../../worker/src/calc/decimal";
import { convertUnit, findUnit, listUnits, resolveUnitPair, type UnitCategory } from "../../../worker/src/calc/units";

export type Category = UnitCategory | "currency";

/** Categories in display order; "currency" is always last. */
export function categories(): Category[] {
  const seen: Category[] = [];
  for (const u of listUnits()) if (!seen.includes(u.category)) seen.push(u.category);
  seen.push("currency");
  return seen;
}

/** Codes (units) or ISO codes (currencies) of one category. */
export function itemsOf(cat: Category): string[] {
  if (cat === "currency") return listCurrencies();
  return listUnits()
    .filter((u) => u.category === cat)
    .map((u) => u.code);
}

/** Default (from, to) pair for a category. */
export function defaultPair(cat: Category): [string, string] {
  const table: Record<Category, [string, string]> = {
    length: ["km", "mi"],
    mass: ["kg", "lb"],
    volume: ["l", "gal"],
    area: ["m2", "ft2"],
    temperature: ["c", "f"],
    speed: ["kmh", "mph"],
    time: ["h", "min"],
    data: ["GB", "MB"],
    pressure: ["bar", "psi"],
    energy: ["kcal", "kj"],
    angle: ["deg", "rad"],
    power: ["kw", "hp"],
    currency: ["USD", "UZS"],
  };
  const [a, b] = table[cat];
  const items = itemsOf(cat);
  return items.includes(a) && items.includes(b) ? [a, b] : [items[0] ?? a, items[1] ?? items[0] ?? b];
}

/** Items of the category matching a search query by code or by any known alias/name. Empty query = all. */
export function searchItems(cat: Category, query: string): string[] {
  const all = itemsOf(cat);
  const q = query.trim();
  if (q === "") return all;
  const lower = q.toLowerCase();
  const hit = new Set<string>();
  if (cat === "currency") {
    const c = findCurrency(q);
    if (c) hit.add(c);
  } else {
    const u = findUnit(q);
    if (u && u.category === cat) hit.add(u.code);
    if (u?.alt && u.alt.category === cat) hit.add(u.alt.code);
  }
  for (const code of all) if (code.toLowerCase().includes(lower)) hit.add(code);
  return all.filter((c) => hit.has(c));
}

export type ConvertError = "units_mismatch" | "no_rate" | "unknown_unit" | "overflow";

export type Converted = { ok: true; value: Decimal } | { ok: false; error: ConvertError };

export function convert(cat: Category, value: Decimal, from: string, to: string, rates: FxRates | null): Converted {
  try {
    if (cat === "currency") {
      if (!rates) return { ok: false, error: "no_rate" };
      const v = convertCurrency(value, from, to, rates);
      return v ? { ok: true, value: v } : { ok: false, error: "no_rate" };
    }
    const f = findUnit(from);
    const t = findUnit(to);
    if (!f || !t) return { ok: false, error: "unknown_unit" };
    const pair = resolveUnitPair(f, t);
    if (!pair) return { ok: false, error: "units_mismatch" };
    return { ok: true, value: convertUnit(value, pair[0], pair[1]) };
  } catch {
    return { ok: false, error: "overflow" };
  }
}

/** Rates payload of GET /api/app/:botId/fx -> FxRates (validated shape, null on garbage). */
export function parseFxPayload(raw: unknown): (FxRates & { stale: boolean }) | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.base !== "string" || typeof o.rates !== "object" || o.rates === null) return null;
  if (typeof o.updated_at !== "number" || !Number.isFinite(o.updated_at)) return null;
  const rates: Record<string, string> = {};
  for (const [k, v] of Object.entries(o.rates as Record<string, unknown>)) if (typeof v === "string") rates[k] = v;
  return { base: o.base, rates, updatedAt: o.updated_at, stale: o.stale === true, ...(typeof o.source === "string" ? { source: o.source } : {}) };
}

/** Currency codes that can actually be converted with this table (base + listed quotes). */
export function availableCurrencies(rates: FxRates | null): string[] {
  const all = listCurrencies();
  if (!rates) return all;
  return all.filter((c) => c === rates.base || typeof rates.rates[c] === "string");
}
