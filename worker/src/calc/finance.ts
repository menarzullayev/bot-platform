// Finance helpers (loans, interest, VAT, discounts). All arithmetic is exact Decimal; values are not
// rounded here (callers round for display, e.g. toFixed(2)). Invalid input throws FinanceError.

import { Decimal, type DecimalLike } from "./decimal";

export type FinanceErrorCode = "bad_principal" | "bad_rate" | "bad_term" | "bad_amount" | "div0";

export class FinanceError extends Error {
  readonly code: FinanceErrorCode;
  constructor(code: FinanceErrorCode, message?: string) {
    super(message ?? code);
    this.name = "FinanceError";
    this.code = code;
  }
}

const D = (x: DecimalLike, code: FinanceErrorCode): Decimal => {
  try {
    return Decimal.from(x);
  } catch {
    throw new FinanceError(code);
  }
};
const HUNDRED = Decimal.from(100);
const TWELVE_HUNDRED = Decimal.from(1200);
const MAX_MONTHS = 1200;
const MAX_RATE_PCT = 1000;

export type LoanType = "annuity" | "diff";

export interface LoanInput {
  principal: DecimalLike;
  annualRatePct: DecimalLike;
  /** Whole number of months, 1..1200. */
  months: number;
  type: LoanType;
}

export interface ScheduleRow {
  month: number;
  payment: Decimal;
  principal: Decimal;
  interest: Decimal;
  /** Remaining balance after the payment. */
  balance: Decimal;
}

export interface LoanResult {
  type: LoanType;
  principal: Decimal;
  annualRatePct: Decimal;
  months: number;
  /** Annuity: the constant monthly payment. */
  monthly?: Decimal;
  /** Differentiated: the first and the last monthly payment. */
  firstPayment?: Decimal;
  lastPayment?: Decimal;
  /** Total paid over the whole term. */
  total: Decimal;
  /** Total interest over the whole term. */
  interest: Decimal;
  /** First min(12, months) rows. */
  schedule: ScheduleRow[];
  /** Sum over the rows in `schedule` only. */
  scheduleTotal: { payment: Decimal; principal: Decimal; interest: Decimal };
  /** interest / principal * 100. */
  overpaymentPct: Decimal;
}

function checkLoan(i: LoanInput): { P: Decimal; rate: Decimal; n: number } {
  const P = D(i.principal, "bad_principal");
  const rate = D(i.annualRatePct, "bad_rate");
  if (P.sign() <= 0) throw new FinanceError("bad_principal");
  if (rate.isNegative() || rate.gt(Decimal.from(MAX_RATE_PCT))) throw new FinanceError("bad_rate");
  if (!Number.isInteger(i.months) || i.months < 1 || i.months > MAX_MONTHS) throw new FinanceError("bad_term");
  return { P, rate, n: i.months };
}

export function loan(input: LoanInput): LoanResult {
  const { P, rate, n } = checkLoan(input);
  const r = rate.div(TWELVE_HUNDRED); // monthly rate as a fraction
  const N = Decimal.from(n);
  const rows: ScheduleRow[] = [];
  let balance = P;
  let monthly: Decimal | undefined;
  let first: Decimal | undefined;
  let last: Decimal | undefined;
  let total: Decimal;

  if (input.type === "diff") {
    const part = P.div(N);
    first = part.add(P.mul(r));
    last = part.add(part.mul(r));
    total = P.add(P.mul(r).mul(N.add(Decimal.ONE)).div(Decimal.from(2)));
    for (let k = 1; k <= Math.min(12, n); k++) {
      const interest = balance.mul(r);
      balance = k === n ? Decimal.ZERO : balance.sub(part);
      rows.push({ month: k, payment: part.add(interest), principal: part, interest, balance });
    }
  } else {
    if (r.isZero()) monthly = P.div(N);
    else {
      const f = Decimal.ONE.add(r).pow(Decimal.from(-n));
      monthly = P.mul(r).div(Decimal.ONE.sub(f));
    }
    total = monthly.mul(N);
    for (let k = 1; k <= Math.min(12, n); k++) {
      const interest = balance.mul(r);
      const princ = monthly.sub(interest);
      balance = k === n ? Decimal.ZERO : balance.sub(princ);
      rows.push({ month: k, payment: monthly, principal: princ, interest, balance });
    }
  }

  let sp = Decimal.ZERO;
  let spr = Decimal.ZERO;
  let si = Decimal.ZERO;
  for (const row of rows) {
    sp = sp.add(row.payment);
    spr = spr.add(row.principal);
    si = si.add(row.interest);
  }
  const interest = total.sub(P);
  const res: LoanResult = {
    type: input.type === "diff" ? "diff" : "annuity",
    principal: P,
    annualRatePct: rate,
    months: n,
    total,
    interest,
    schedule: rows,
    scheduleTotal: { payment: sp, principal: spr, interest: si },
    overpaymentPct: interest.mul(HUNDRED).div(P),
  };
  if (monthly) res.monthly = monthly;
  if (first && last) {
    res.firstPayment = first;
    res.lastPayment = last;
  }
  return res;
}

export interface CompoundInput {
  principal: DecimalLike;
  annualRatePct: DecimalLike;
  years: DecimalLike;
  /** Compounding periods per year (1 = yearly, 12 = monthly, 365 = daily). */
  perYear: number;
}

export interface CompoundResult {
  final: Decimal;
  interest: Decimal;
  /** Effective annual rate in percent. */
  effectiveAnnualPct: Decimal;
}

export function compound(input: CompoundInput): CompoundResult {
  const P = D(input.principal, "bad_principal");
  const rate = D(input.annualRatePct, "bad_rate");
  const years = D(input.years, "bad_term");
  if (P.sign() <= 0) throw new FinanceError("bad_principal");
  if (rate.isNegative() || rate.gt(Decimal.from(MAX_RATE_PCT))) throw new FinanceError("bad_rate");
  if (years.isNegative() || years.gt(Decimal.from(200))) throw new FinanceError("bad_term");
  const m = input.perYear;
  if (!Number.isInteger(m) || m < 1 || m > 366) throw new FinanceError("bad_term");
  const M = Decimal.from(m);
  const growth = Decimal.ONE.add(rate.div(HUNDRED).div(M));
  let final: Decimal;
  let eff: Decimal;
  try {
    final = P.mul(growth.pow(M.mul(years)));
    eff = growth.pow(M).sub(Decimal.ONE).mul(HUNDRED);
  } catch {
    throw new FinanceError("bad_term");
  }
  return { final, interest: final.sub(P), effectiveAnnualPct: eff };
}

export function simpleInterest(input: { principal: DecimalLike; annualRatePct: DecimalLike; years: DecimalLike }): {
  interest: Decimal;
  total: Decimal;
} {
  const P = D(input.principal, "bad_principal");
  const rate = D(input.annualRatePct, "bad_rate");
  const years = D(input.years, "bad_term");
  if (P.sign() <= 0) throw new FinanceError("bad_principal");
  if (rate.isNegative()) throw new FinanceError("bad_rate");
  if (years.isNegative()) throw new FinanceError("bad_term");
  const interest = P.mul(rate).mul(years).div(HUNDRED);
  return { interest, total: P.add(interest) };
}

/** Default VAT rate of Uzbekistan, percent. */
export const DEFAULT_VAT_PCT = 12;

/** mode "add": amount is net, VAT is added. mode "remove": amount is gross, VAT is extracted. */
export function vat(input: { amount: DecimalLike; ratePct?: DecimalLike; mode: "add" | "remove" }): {
  net: Decimal;
  vat: Decimal;
  gross: Decimal;
} {
  const amount = D(input.amount, "bad_amount");
  const rate = D(input.ratePct ?? DEFAULT_VAT_PCT, "bad_rate");
  if (rate.isNegative() || rate.gt(Decimal.from(MAX_RATE_PCT))) throw new FinanceError("bad_rate");
  if (input.mode === "remove") {
    const net = amount.div(Decimal.ONE.add(rate.div(HUNDRED)));
    return { net, vat: amount.sub(net), gross: amount };
  }
  const v = amount.mul(rate).div(HUNDRED);
  return { net: amount, vat: v, gross: amount.add(v) };
}

export function discount(input: { price: DecimalLike; pct: DecimalLike }): { final: Decimal; saved: Decimal } {
  const price = D(input.price, "bad_amount");
  const pct = D(input.pct, "bad_rate");
  const saved = price.mul(pct).div(HUNDRED);
  return { final: price.sub(saved), saved };
}

/** Change from `from` to `to`: absolute and in percent of `from`. */
export function percentChange(input: { from: DecimalLike; to: DecimalLike }): { change: Decimal; changePct: Decimal } {
  const from = D(input.from, "bad_amount");
  const to = D(input.to, "bad_amount");
  if (from.isZero()) throw new FinanceError("div0");
  const change = to.sub(from);
  return { change, changePct: change.mul(HUNDRED).div(from.abs()) };
}

/** Profit, markup (profit / cost) and margin (profit / price) in percent. */
export function markupMargin(input: { cost: DecimalLike; price: DecimalLike }): {
  profit: Decimal;
  markupPct: Decimal;
  marginPct: Decimal;
} {
  const cost = D(input.cost, "bad_amount");
  const price = D(input.price, "bad_amount");
  if (cost.isZero() || price.isZero()) throw new FinanceError("div0");
  const profit = price.sub(cost);
  return { profit, markupPct: profit.mul(HUNDRED).div(cost), marginPct: profit.mul(HUNDRED).div(price) };
}

// ---------- /loan argument parsing ----------

export type LoanArgs =
  | { ok: true; principal: Decimal; annualRatePct: Decimal; months: number; type: LoanType }
  | { ok: false; error: "syntax" | "bad_principal" | "bad_rate" | "bad_term" };

const DIFF_WORDS = new Set(["diff", "differentiated", "differensial", "differensiallangan", "дифф", "дифференцированный", "дифференцированная", "diferenciado", "diferansiyel"]);
const ANNUITY_WORDS = new Set(["annuity", "annuitet", "anuitet", "annuite", "аннуитет", "аннуитетный", "anualidad", "anuite"]);
const YEAR_RE = /^(\d+(?:\.\d+)?)(y|yr|yrs|year|years|yil|yillik|г|год|года|лет|л|ano|anos|año|años|yıl|yil)$/i;
const MONTH_RE = /^(\d+(?:\.\d+)?)(m|mo|mos|month|months|oy|ay|мес|месяц|месяцев|месяца|мес\.|mes|meses)$/i;
const NUM_RE = /^\d+(?:\.\d+)?$/;

/** Parse "50000 18 24", "50000 18% 24m", "50000 18 2y annuity|diff". The 3rd number is months unless it has a year suffix. */
export function parseLoanArgs(text: string): LoanArgs {
  try {
    if (typeof text !== "string" || text.length > 200) return { ok: false, error: "syntax" };
    const toks = text
      .replace(/[   ]/g, " ")
      .replace(/%/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    let type: LoanType = "annuity";
    const nums: string[] = [];
    for (let i = 0; i < toks.length; i++) {
      let t = toks[i].toLowerCase().replace(/(\d),(\d)/g, "$1.$2");
      // "3 yil" / "24 oy": glue a separate unit word to the number before it.
      const next = toks[i + 1]?.toLowerCase();
      if (next && !/^[\d.]/.test(next) && NUM_RE.test(t) && (YEAR_RE.test("1" + next) || MONTH_RE.test("1" + next))) {
        t += next;
        i++;
      }
      if (DIFF_WORDS.has(t)) type = "diff";
      else if (ANNUITY_WORDS.has(t)) type = "annuity";
      else nums.push(t);
    }
    // "50 000 18 24" style grouping is ambiguous, so exactly three values are required.
    if (nums.length !== 3) return { ok: false, error: "syntax" };
    const [p, r, term] = nums;
    if (!NUM_RE.test(p)) return { ok: false, error: "syntax" };
    if (!NUM_RE.test(r)) return { ok: false, error: "syntax" };
    let months: number;
    const ym = YEAR_RE.exec(term);
    const mm = MONTH_RE.exec(term);
    if (ym) months = Number(ym[1]) * 12;
    else if (mm) months = Number(mm[1]);
    else if (NUM_RE.test(term)) months = Number(term);
    else return { ok: false, error: "syntax" };
    if (!Number.isFinite(months) || Math.abs(months - Math.round(months)) > 1e-9) return { ok: false, error: "bad_term" };
    months = Math.round(months);
    if (months < 1 || months > MAX_MONTHS) return { ok: false, error: "bad_term" };
    const principal = Decimal.parse(p);
    const annualRatePct = Decimal.parse(r);
    if (principal.sign() <= 0) return { ok: false, error: "bad_principal" };
    if (annualRatePct.gt(Decimal.from(MAX_RATE_PCT))) return { ok: false, error: "bad_rate" };
    return { ok: true, principal, annualRatePct, months, type };
  } catch {
    return { ok: false, error: "syntax" };
  }
}
