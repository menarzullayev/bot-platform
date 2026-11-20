// Finance tools of the Mini App: field definitions and computation on top of worker/src/calc/finance. Pure, DOM-free.

import { Decimal } from "../../../worker/src/calc/decimal";
import type { LocaleCode } from "../../../worker/src/calc/format";
import {
  DEFAULT_VAT_PCT,
  FinanceError,
  compound,
  discount,
  loan,
  markupMargin,
  percentChange,
  simpleInterest,
  vat,
} from "../../../worker/src/calc/finance";
import { formatMoney, formatPercent, parseNumber } from "./num";

export type ToolId = "loan" | "vat" | "discount" | "percent" | "compound" | "simple" | "markup";
export const TOOL_IDS: readonly ToolId[] = ["loan", "vat", "discount", "percent", "compound", "simple", "markup"];

export interface FieldDef {
  id: string;
  /** Key of miniapp/src/strings.ts. */
  label: string;
  kind: "number" | "choice";
  default: string;
  /** For `choice`: [value, label key]. */
  options?: readonly (readonly [string, string])[];
}

export const TOOLS: Record<ToolId, { title: string; fields: readonly FieldDef[] }> = {
  loan: {
    title: "fin_loan",
    fields: [
      { id: "principal", label: "f_principal", kind: "number", default: "50000000" },
      { id: "rate", label: "f_rate", kind: "number", default: "24" },
      { id: "months", label: "f_months", kind: "number", default: "24" },
      {
        id: "type",
        label: "f_type",
        kind: "choice",
        default: "annuity",
        options: [
          ["annuity", "f_annuity"],
          ["diff", "f_diff"],
        ],
      },
    ],
  },
  vat: {
    title: "fin_vat",
    fields: [
      { id: "amount", label: "f_amount", kind: "number", default: "1000000" },
      { id: "rate", label: "f_vat_rate", kind: "number", default: String(DEFAULT_VAT_PCT) },
      {
        id: "mode",
        label: "f_mode",
        kind: "choice",
        default: "add",
        options: [
          ["add", "f_vat_add"],
          ["remove", "f_vat_remove"],
        ],
      },
    ],
  },
  discount: {
    title: "fin_discount",
    fields: [
      { id: "price", label: "f_price", kind: "number", default: "250000" },
      { id: "pct", label: "f_discount_pct", kind: "number", default: "15" },
    ],
  },
  percent: {
    title: "fin_percent",
    fields: [
      { id: "from", label: "f_from", kind: "number", default: "80" },
      { id: "to", label: "f_to", kind: "number", default: "100" },
    ],
  },
  compound: {
    title: "fin_compound",
    fields: [
      { id: "principal", label: "f_principal", kind: "number", default: "10000000" },
      { id: "rate", label: "f_rate", kind: "number", default: "18" },
      { id: "years", label: "f_years", kind: "number", default: "5" },
      {
        id: "perYear",
        label: "f_compounding",
        kind: "choice",
        default: "12",
        options: [
          ["1", "f_yearly"],
          ["4", "f_quarterly"],
          ["12", "f_monthly"],
          ["365", "f_daily"],
        ],
      },
    ],
  },
  simple: {
    title: "fin_simple",
    fields: [
      { id: "principal", label: "f_principal", kind: "number", default: "10000000" },
      { id: "rate", label: "f_rate", kind: "number", default: "18" },
      { id: "years", label: "f_years", kind: "number", default: "2" },
    ],
  },
  markup: {
    title: "fin_markup",
    fields: [
      { id: "cost", label: "f_cost", kind: "number", default: "80" },
      { id: "price", label: "f_price", kind: "number", default: "100" },
    ],
  },
};

export interface ResultRow {
  /** Key of strings.ts, or of the i18n catalog (loan_label_*). */
  label: string;
  value: string;
  strong?: boolean;
}

export interface ScheduleLine {
  month: string;
  payment: string;
  principal: string;
  interest: string;
  balance: string;
}

export type ToolResult =
  | { ok: true; rows: ResultRow[]; schedule?: ScheduleLine[] }
  | { ok: false; error: "bad_input" | "bad_principal" | "bad_rate" | "bad_term" | "bad_amount" | "div0" };

export function defaultsOf(id: ToolId): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of TOOLS[id].fields) out[f.id] = f.default;
  return out;
}

/** Runs a tool on raw text field values. Never throws. */
export function computeTool(id: ToolId, raw: Record<string, string>, lang: LocaleCode): ToolResult {
  const num = (k: string): Decimal | null => parseNumber(raw[k] ?? "");
  const money = (d: Decimal): string => formatMoney(d, lang);
  const pct = (d: Decimal): string => formatPercent(d, lang);
  try {
    switch (id) {
      case "loan": {
        const p = num("principal");
        const r = num("rate");
        const m = num("months");
        if (!p || !r || !m || !m.isInteger() || m.abs().gt(Decimal.from(100000))) return { ok: false, error: "bad_input" };
        const type = raw.type === "diff" ? "diff" : "annuity";
        const res = loan({ principal: p, annualRatePct: r, months: Number(m.toString()), type });
        const rows: ResultRow[] =
          type === "annuity" && res.monthly
            ? [{ label: "loan_label_monthly", value: money(res.monthly), strong: true }]
            : [
                { label: "r_first_payment", value: money(res.firstPayment ?? Decimal.ZERO), strong: true },
                { label: "r_last_payment", value: money(res.lastPayment ?? Decimal.ZERO) },
              ];
        rows.push(
          { label: "loan_label_total", value: money(res.total) },
          { label: "loan_label_interest", value: money(res.interest) },
          { label: "r_overpayment", value: pct(res.overpaymentPct) },
        );
        return {
          ok: true,
          rows,
          schedule: res.schedule.map((s) => ({
            month: String(s.month),
            payment: money(s.payment),
            principal: money(s.principal),
            interest: money(s.interest),
            balance: money(s.balance),
          })),
        };
      }
      case "vat": {
        const a = num("amount");
        const r = num("rate");
        if (!a || !r) return { ok: false, error: "bad_input" };
        const res = vat({ amount: a, ratePct: r, mode: raw.mode === "remove" ? "remove" : "add" });
        return {
          ok: true,
          rows: [
            { label: "r_net", value: money(res.net) },
            { label: "r_vat", value: money(res.vat), strong: true },
            { label: "r_gross", value: money(res.gross), strong: true },
          ],
        };
      }
      case "discount": {
        const p = num("price");
        const d = num("pct");
        if (!p || !d) return { ok: false, error: "bad_input" };
        const res = discount({ price: p, pct: d });
        return {
          ok: true,
          rows: [
            { label: "r_final", value: money(res.final), strong: true },
            { label: "r_saved", value: money(res.saved) },
          ],
        };
      }
      case "percent": {
        const a = num("from");
        const b = num("to");
        if (!a || !b) return { ok: false, error: "bad_input" };
        const res = percentChange({ from: a, to: b });
        return {
          ok: true,
          rows: [
            { label: "r_change_pct", value: pct(res.changePct), strong: true },
            { label: "r_change", value: formatMoney(res.change, lang, 6) },
          ],
        };
      }
      case "compound": {
        const p = num("principal");
        const r = num("rate");
        const y = num("years");
        const n = Number(raw.perYear);
        if (!p || !r || !y || !Number.isInteger(n)) return { ok: false, error: "bad_input" };
        const res = compound({ principal: p, annualRatePct: r, years: y, perYear: n });
        return {
          ok: true,
          rows: [
            { label: "r_final", value: money(res.final), strong: true },
            { label: "loan_label_interest", value: money(res.interest) },
            { label: "r_effective", value: pct(res.effectiveAnnualPct) },
          ],
        };
      }
      case "simple": {
        const p = num("principal");
        const r = num("rate");
        const y = num("years");
        if (!p || !r || !y) return { ok: false, error: "bad_input" };
        const res = simpleInterest({ principal: p, annualRatePct: r, years: y });
        return {
          ok: true,
          rows: [
            { label: "r_final", value: money(res.total), strong: true },
            { label: "loan_label_interest", value: money(res.interest) },
          ],
        };
      }
      case "markup": {
        const c = num("cost");
        const p = num("price");
        if (!c || !p) return { ok: false, error: "bad_input" };
        const res = markupMargin({ cost: c, price: p });
        return {
          ok: true,
          rows: [
            { label: "r_profit", value: money(res.profit), strong: true },
            { label: "r_markup", value: pct(res.markupPct) },
            { label: "r_margin", value: pct(res.marginPct) },
          ],
        };
      }
    }
  } catch (e) {
    if (e instanceof FinanceError) return { ok: false, error: e.code };
    return { ok: false, error: "bad_input" };
  }
}
