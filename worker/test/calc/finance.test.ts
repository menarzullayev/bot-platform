import { describe, expect, it } from "vitest";
import {
  compound,
  Decimal,
  discount,
  FinanceError,
  loan,
  markupMargin,
  parseLoanArgs,
  percentChange,
  simpleInterest,
  vat,
} from "../../src/calc";

const fx = (d: Decimal | undefined, dp = 2): string => (d as Decimal).toFixed(dp);

describe("loan: annuity", () => {
  it("100000 at 12% for 12 months", () => {
    const r = loan({ principal: 100000, annualRatePct: 12, months: 12, type: "annuity" });
    expect(fx(r.monthly)).toBe("8884.88");
    expect(fx(r.total)).toBe("106618.55");
    expect(fx(r.interest)).toBe("6618.55");
    expect(fx(r.overpaymentPct)).toBe("6.62");
    expect(r.schedule).toHaveLength(12);
    expect(r.schedule[0].interest.toFixed(2)).toBe("1000.00");
    expect(r.schedule[0].principal.toFixed(2)).toBe("7884.88");
    expect(r.schedule[11].balance.toFixed(6)).toBe("0.000000");
    expect(r.scheduleTotal.payment.toFixed(2)).toBe(fx(r.total));
    expect(r.scheduleTotal.principal.toFixed(2)).toBe("100000.00");
  });
  it("1,000,000 at 24% for 24 months (known payment 52871.10)", () => {
    const r = loan({ principal: 1000000, annualRatePct: 24, months: 24, type: "annuity" });
    expect(fx(r.monthly)).toBe("52871.10");
  });
  it("0% interest", () => {
    const r = loan({ principal: 12000, annualRatePct: 0, months: 12, type: "annuity" });
    expect(r.monthly?.toString()).toBe("1000");
    expect(r.interest.toString()).toBe("0");
    expect(r.overpaymentPct.toString()).toBe("0");
    expect(r.schedule[11].balance.toString()).toBe("0");
  });
  it("schedule is limited to 12 rows for long loans and ends with the balance", () => {
    const r = loan({ principal: 50000, annualRatePct: 18, months: 24, type: "annuity" });
    expect(r.schedule).toHaveLength(12);
    expect(r.schedule[11].balance.gt(Decimal.ZERO)).toBe(true);
  });
  it("one-month loan", () => {
    const r = loan({ principal: 1000, annualRatePct: 12, months: 1, type: "annuity" });
    expect(fx(r.monthly)).toBe("1010.00");
  });
  it("long loan (30 years)", () => {
    const r = loan({ principal: 100000, annualRatePct: 6, months: 360, type: "annuity" });
    expect(fx(r.monthly)).toBe("599.55");
  });
});

describe("loan: differentiated", () => {
  it("payments sum to the total", () => {
    const r = loan({ principal: 12000, annualRatePct: 12, months: 12, type: "diff" });
    expect(fx(r.firstPayment)).toBe("1120.00");
    expect(fx(r.lastPayment)).toBe("1010.00");
    expect(fx(r.total)).toBe("12780.00");
    expect(fx(r.interest)).toBe("780.00");
    let sum = Decimal.ZERO;
    for (const row of r.schedule) sum = sum.add(row.payment);
    expect(sum.toFixed(2)).toBe("12780.00");
    expect(r.scheduleTotal.payment.toFixed(2)).toBe("12780.00");
    expect(r.schedule[0].payment.toFixed(2)).toBe("1120.00");
    expect(r.schedule[11].payment.toFixed(2)).toBe("1010.00");
    expect(r.schedule[11].balance.toString()).toBe("0");
  });
  it("sum of all payments of a 24-month loan equals total", () => {
    const r = loan({ principal: 50000, annualRatePct: 18, months: 24, type: "diff" });
    // rebuild the full schedule independently
    const part = Decimal.from(50000).div(Decimal.from(24));
    let bal = Decimal.from(50000);
    let sum = Decimal.ZERO;
    for (let k = 0; k < 24; k++) {
      sum = sum.add(part.add(bal.mul(Decimal.parse("0.015"))));
      bal = bal.sub(part);
    }
    expect(sum.toFixed(6)).toBe(r.total.toFixed(6));
    expect(fx(r.firstPayment)).toBe("2833.33");
  });
  it("0% interest", () => {
    const r = loan({ principal: 1200, annualRatePct: 0, months: 12, type: "diff" });
    expect(r.firstPayment?.toString()).toBe("100");
    expect(r.lastPayment?.toString()).toBe("100");
    expect(r.interest.toString()).toBe("0");
  });
  it("diff pays less interest than annuity", () => {
    const a = loan({ principal: 100000, annualRatePct: 20, months: 36, type: "annuity" });
    const d = loan({ principal: 100000, annualRatePct: 20, months: 36, type: "diff" });
    expect(d.interest.lt(a.interest)).toBe(true);
  });
});

describe("loan: validation", () => {
  const bad = (i: Parameters<typeof loan>[0], code: string) => {
    try {
      loan(i);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(FinanceError);
      expect((e as FinanceError).code).toBe(code);
    }
  };
  it("rejects bad input", () => {
    bad({ principal: 0, annualRatePct: 10, months: 12, type: "annuity" }, "bad_principal");
    bad({ principal: -5, annualRatePct: 10, months: 12, type: "annuity" }, "bad_principal");
    bad({ principal: "abc", annualRatePct: 10, months: 12, type: "annuity" }, "bad_principal");
    bad({ principal: 100, annualRatePct: -1, months: 12, type: "annuity" }, "bad_rate");
    bad({ principal: 100, annualRatePct: 5000, months: 12, type: "diff" }, "bad_rate");
    bad({ principal: 100, annualRatePct: 10, months: 0, type: "annuity" }, "bad_term");
    bad({ principal: 100, annualRatePct: 10, months: 1.5, type: "annuity" }, "bad_term");
    bad({ principal: 100, annualRatePct: 10, months: 5000, type: "annuity" }, "bad_term");
  });
});

describe("compound / simple interest", () => {
  it("1000 at 10% for 2 years, yearly", () => {
    const r = compound({ principal: 1000, annualRatePct: 10, years: 2, perYear: 1 });
    expect(r.final.toString()).toBe("1210");
    expect(r.interest.toString()).toBe("210");
    expect(r.effectiveAnnualPct.toString()).toBe("10");
  });
  it("monthly compounding", () => {
    const r = compound({ principal: 1000, annualRatePct: 12, years: 1, perYear: 12 });
    expect(fx(r.final)).toBe("1126.83");
    expect(fx(r.effectiveAnnualPct)).toBe("12.68");
  });
  it("0% and fractional years", () => {
    expect(compound({ principal: 500, annualRatePct: 0, years: 3, perYear: 12 }).final.toString()).toBe("500");
    expect(fx(compound({ principal: 1000, annualRatePct: 10, years: 0.5, perYear: 1 }).final)).toBe("1048.81");
  });
  it("rejects bad input", () => {
    expect(() => compound({ principal: 1000, annualRatePct: 10, years: 1, perYear: 0 })).toThrow(FinanceError);
    expect(() => compound({ principal: 1000, annualRatePct: 10, years: -1, perYear: 1 })).toThrow(FinanceError);
    expect(() => compound({ principal: 0, annualRatePct: 10, years: 1, perYear: 1 })).toThrow(FinanceError);
  });
  it("simple interest", () => {
    const r = simpleInterest({ principal: 1000, annualRatePct: 10, years: 2.5 });
    expect(r.interest.toString()).toBe("250");
    expect(r.total.toString()).toBe("1250");
  });
});

describe("vat / discount / percent", () => {
  it("default VAT is 12%", () => {
    const r = vat({ amount: 1000, mode: "add" });
    expect(r.vat.toString()).toBe("120");
    expect(r.gross.toString()).toBe("1120");
    expect(r.net.toString()).toBe("1000");
  });
  it("remove VAT", () => {
    const r = vat({ amount: 1120, mode: "remove" });
    expect(r.net.toFixed(2)).toBe("1000.00");
    expect(r.vat.toFixed(2)).toBe("120.00");
    expect(r.gross.toString()).toBe("1120");
  });
  it("custom rate and 0%", () => {
    expect(vat({ amount: 200, ratePct: 20, mode: "add" }).gross.toString()).toBe("240");
    expect(vat({ amount: 200, ratePct: 0, mode: "remove" }).net.toString()).toBe("200");
    expect(() => vat({ amount: 200, ratePct: -1, mode: "add" })).toThrow(FinanceError);
  });
  it("discount", () => {
    const r = discount({ price: 250, pct: 20 });
    expect(r.final.toString()).toBe("200");
    expect(r.saved.toString()).toBe("50");
  });
  it("percent change", () => {
    expect(percentChange({ from: 80, to: 100 }).changePct.toString()).toBe("25");
    expect(percentChange({ from: 100, to: 80 }).changePct.toString()).toBe("-20");
    expect(percentChange({ from: 100, to: 80 }).change.toString()).toBe("-20");
    expect(() => percentChange({ from: 0, to: 5 })).toThrow(FinanceError);
  });
  it("markup and margin", () => {
    const r = markupMargin({ cost: 80, price: 100 });
    expect(r.profit.toString()).toBe("20");
    expect(r.markupPct.toString()).toBe("25");
    expect(r.marginPct.toString()).toBe("20");
    expect(() => markupMargin({ cost: 0, price: 5 })).toThrow(FinanceError);
  });
});

describe("parseLoanArgs", () => {
  const ok = (s: string) => {
    const r = parseLoanArgs(s);
    if (!r.ok) throw new Error(`${s}: ${r.error}`);
    return `${r.principal} ${r.annualRatePct} ${r.months} ${r.type}`;
  };
  it("accepted forms", () => {
    expect(ok("50000 18 24")).toBe("50000 18 24 annuity");
    expect(ok("50000 18% 24m")).toBe("50000 18 24 annuity");
    expect(ok("50000 18 2y annuity")).toBe("50000 18 24 annuity");
    expect(ok("50000 18 2y diff")).toBe("50000 18 24 diff");
    expect(ok("50000 18.5 3 yil")).toBe("50000 18.5 3 annuity".replace("3 annuity", "36 annuity"));
    expect(ok("diff 1000 12 6 oy")).toBe("1000 12 6 diff");
    expect(ok("1000 12 1.5y")).toBe("1000 12 18 annuity");
    expect(ok("  1000   0%  12mes ")).toBe("1000 0 12 annuity");
    expect(ok("1000 12,5 12 аннуитет")).toBe("1000 12.5 12 annuity");
  });
  it("errors", () => {
    expect(parseLoanArgs("")).toEqual({ ok: false, error: "syntax" });
    expect(parseLoanArgs("50000 18")).toEqual({ ok: false, error: "syntax" });
    expect(parseLoanArgs("a b c")).toEqual({ ok: false, error: "syntax" });
    expect(parseLoanArgs("1 2 3 4")).toEqual({ ok: false, error: "syntax" });
    expect(parseLoanArgs("0 10 12")).toEqual({ ok: false, error: "bad_principal" });
    expect(parseLoanArgs("1000 10 0")).toEqual({ ok: false, error: "bad_term" });
    expect(parseLoanArgs("1000 10 2.5")).toEqual({ ok: false, error: "bad_term" });
    expect(parseLoanArgs("1000 10 101y")).toEqual({ ok: false, error: "bad_term" });
    expect(parseLoanArgs("1000 5000 12")).toEqual({ ok: false, error: "bad_rate" });
    expect(parseLoanArgs("-1000 10 12")).toEqual({ ok: false, error: "syntax" });
  });
  it("parsed result feeds loan()", () => {
    const p = parseLoanArgs("100000 12 12");
    if (!p.ok) throw new Error("parse");
    expect(fx(loan(p).monthly)).toBe("8884.88");
  });
});

describe("finance: fuzz", () => {
  it("parseLoanArgs never throws", () => {
    const parts = ["100", "-5", "0", "12%", "24m", "2y", "diff", "annuity", "x", "1e999", "99999999999999999999999", ",", "\u0000", "5.5.5", "%", ".", "Infinity", "NaN"];
    let seed = 99;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 3000; i++) {
      const s = Array.from({ length: Math.floor(rnd() * 6) }, () => parts[Math.floor(rnd() * parts.length)]).join(" ");
      const r = parseLoanArgs(s);
      if (r.ok) expect(() => loan(r)).not.toThrow();
    }
    expect(parseLoanArgs("1 ".repeat(1000))).toEqual({ ok: false, error: "syntax" });
  });
  it("loan of 100 years is fast", () => {
    const t = performance.now();
    loan({ principal: 1e9, annualRatePct: 25, months: 1200, type: "annuity" });
    expect(performance.now() - t).toBeLessThan(30);
  });
});
