// Currency codes, symbol/name aliases (7 languages) and cross-rate conversion through the rate table's base.

import { Decimal } from "./decimal";
import { normalizeToken, tokenCandidates } from "./units";

/** Rate table. rates[X] is how many units of X one unit of `base` buys; the base itself is implicitly "1". */
export interface FxRates {
  base: string;
  rates: Record<string, string>;
  /** Unix seconds of the last refresh. */
  updatedAt: number;
  /** Data source label (optional). */
  source?: string;
}

// [ISO code, aliases separated by "|"]. The lower-case ISO code is always an alias too.
const CURRENCIES: [string, string][] = [
  ["USD", "us$|$|dollar|dollars|dollor|dollari|dollarlar|aqsh dollari|usa dollar|dolar|dolares|доллар|долларов|доллара|доллары|долл|бакс|баксов|buck|bucks|baks|دولار"],
  ["EUR", "€|euro|euros|evro|evr|евро"],
  ["UZS", "so'm|som|sum|soum|sumov|сум|сўм|сумов|сумы|uzbek som|uzbek sum|uzbekistan som|uzbekistani som|ozbek somi|uzbek somi|сум узбекский"],
  ["RUB", "₽|ruble|rubles|rubl|rubli|rublo|rublos|rublesi|rubla|rossiya rubli|rus rubli|руб|рубль|рубля|рублей|рубл|р|روبل"],
  ["KZT", "₸|tenge|tenga|тенге|теңге|kazakh tenge"],
  ["TRY", "₺|lira|liras|lirasi|liralar|лира|лир|лиры|tl|turk lirasi|turkish lira"],
  ["CNY", "rmb|yuan|yuanlar|юань|юаней|юаня|юани|元|renminbi"],
  ["GBP", "£|pound sterling|pounds sterling|sterling|funt sterling|ing funti|pound|pounds|фунт стерлингов|фунт стерлинга|фунт|фунты|фунтов|libra esterlina|sterlin|جنيه استرليني"],
  ["JPY", "¥|yen|yena|jena|иена|иен|иены|йена|йен|йены|円|yen japones"],
  ["AED", "dirham|dirhams|dirhem|dh|дирхам|дирхамов|дирхама|bae dirhami|uae dirham|درهم"],
  ["KRW", "₩|won|von|вон|korean won|koreya voni"],
  ["INR", "₹|rupee|rupees|rupiya|rupia|rupias|рупия|рупий|рупии"],
  ["CHF", "franc|francs|frank|франк|франков|франки|swiss franc|shveytsariya franki"],
  ["CAD", "c$|can$|canadian dollar|kanada dollari|kanada dolari|канадский доллар|dolar canadiense"],
  ["AUD", "a$|au$|australian dollar|avstraliya dollari|avustralya dolari|австралийский доллар|dolar australiano"],
  ["KGS", "сом|сомов|сома|сомы|kyrgyz som|kirgiz somi|qirgiz somi|kyrgyzstani som"],
  ["TJS", "somoni|сомони|tajik somoni|tojik somonisi"],
  ["UAH", "₴|hryvnia|hryvnya|grivna|grivnya|grivnasi|ukraina grivnasi|гривна|гривен|гривны|гривня"],
  ["PLN", "zl|zł|zloty|zlotych|złoty|zloti|злотый|злотых|злотые"],
  ["SAR", "riyal|rial|riyol|riyoli|saudi riyal|saudiya riyoli|saudi rial|риял|ريال"],
  ["BRL", "r$|real|reais|brazilian real|braziliya reali|brasil reali|реал|реалов"],
  ["EGP", "e£|egyptian pound|misr funti|misir lirasi|египетский фунт|libra egipcia"],
  ["BYN", "byr|belarusian ruble|belarus rubli|белорусский рубль|белорусских рублей"],
  ["AZN", "₼|manat|манат|манатов|azerbaijani manat|ozarbayjon manati|azeri manati"],
  ["GEL", "₾|lari|лари|georgian lari|gruziya larisi|gurcu larisi"],
];

let MAP: Map<string, string> | null = null;
let CODES: Set<string> | null = null;

function build(): void {
  const m = new Map<string, string>();
  const codes = new Set<string>();
  for (const [code] of CURRENCIES) {
    codes.add(code);
    m.set(code.toLowerCase(), code);
  }
  for (const [code, names] of CURRENCIES) {
    for (const name of names.split("|")) {
      const key = normalizeToken(name);
      if (key && !m.has(key)) m.set(key, code);
    }
  }
  MAP = m;
  CODES = codes;
}

/** Supported ISO codes. */
export function listCurrencies(): string[] {
  if (!CODES) build();
  return [...(CODES as Set<string>)];
}

/** Resolve a currency code, symbol or name (any supported language) to its ISO code, or null. */
export function findCurrency(token: string): string | null {
  if (typeof token !== "string" || token.length === 0 || token.length > 48) return null;
  if (!MAP) build();
  const n = normalizeToken(token);
  if (n.length === 0) return null;
  for (const c of tokenCandidates(n)) {
    const hit = (MAP as Map<string, string>).get(c);
    if (hit) return hit;
  }
  return null;
}

function rateOf(rates: FxRates, code: string): Decimal | null {
  if (code === rates.base) return Decimal.ONE;
  const s = rates.rates[code];
  if (typeof s !== "string") return null;
  try {
    const d = Decimal.parse(s);
    return d.sign() > 0 ? d : null;
  } catch {
    return null;
  }
}

/** Convert through the table's base: value * rate[to] / rate[from]. Null when a rate is missing or invalid. */
export function convertCurrency(value: Decimal, from: string, to: string, rates: FxRates): Decimal | null {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return value;
  try {
    const rf = rateOf(rates, f);
    const rt = rateOf(rates, t);
    if (!rf || !rt) return null;
    return value.mul(rt).div(rf);
  } catch {
    return null;
  }
}
