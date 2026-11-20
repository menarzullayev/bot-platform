import { describe, expect, it } from "vitest";
import { CalcError, evaluate, formatDecimal } from "../../src/calc";
import { err, val } from "./util";

/** Small deterministic PRNG so failures are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = "0123456789 .,;:+-*/^!%()=_ \t\nabcdexpilnogsqrtfmdhywz×÷−√π ‏‮\u0000<>&\"'\\١😀ش";
const WORDS = ["sin", "cos", "tan", "ln", "log", "sqrt", "fact", "pi", "e", "mod", "of", "ncr", "max", "x", "ans", "10", "2", "0.5", "1e3", "999", "9", "(", ")", "^", "!", "%", "+", "-", "*", "/", ",", "=", ";"];

describe("fuzz", () => {
  it("2000 random character strings never throw and each takes < 50 ms", () => {
    const rand = rng(12345);
    let ok = 0;
    for (let i = 0; i < 2000; i++) {
      const len = 1 + Math.floor(rand() * 60);
      let s = "";
      for (let j = 0; j < len; j++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
      const t0 = performance.now();
      const r = evaluate(s, { angle: rand() < 0.5 ? "deg" : "rad" });
      const dt = performance.now() - t0;
      expect(dt, `input ${JSON.stringify(s)}`).toBeLessThan(50);
      if (r.ok) {
        ok++;
        formatDecimal(r.value); // formatting must not throw either
      } else {
        expect(r.error).toBeInstanceOf(CalcError);
      }
    }
    expect(ok).toBeGreaterThanOrEqual(0);
  });

  it("2000 random token sequences (often valid) never throw and each takes < 50 ms", () => {
    const rand = rng(777);
    let ok = 0;
    for (let i = 0; i < 2000; i++) {
      const len = 1 + Math.floor(rand() * 25);
      let s = "";
      for (let j = 0; j < len; j++) s += WORDS[Math.floor(rand() * WORDS.length)] + (rand() < 0.3 ? " " : "");
      const t0 = performance.now();
      const r = evaluate(s);
      const dt = performance.now() - t0;
      expect(dt, `input ${JSON.stringify(s)}`).toBeLessThan(50);
      if (r.ok) {
        ok++;
        formatDecimal(r.value);
      }
    }
    expect(ok).toBeGreaterThan(20); // the generator must actually exercise the evaluator
  });

  it("pathological but short inputs stay fast", () => {
    const cases = [
      "9^9^9^9",
      "99999999999^99999999999",
      "fact(fact(fact(5)))",
      "1000!^2",
      "ncr(1000000, 500000)",
      "npr(99999999, 99999999)",
      "sqrt(10^9999)",
      "exp(exp(exp(2)))",
      "ln(1e-9999)",
      "sin(1e9999)",
      "cos(10^9999)",
      "tan(1e5000)",
      "2^(2^(2^(2^2)))",
      "0.1^9999",
      "1/3^9999",
      "(1/3)^9999",
      "7^0.5^0.5^0.5",
      "atan(1e9999)",
      "sinh(30000)",
      "10^9999*10^9999",
      "10^-9999/10^9999",
      "1e5000+1e-5000",
      "log(1e9999, 1.0000000001)",
      "gcd(10^1999, 10^1999 - 1)",
      "lcm(10^999, 10^999 - 1, 10^999 - 2)",
      "fact(1000)+fact(1000)+fact(1000)+fact(1000)",
      "asin(0.9999999999999999999999999999999999)",
    ];
    for (const s of cases) {
      const t0 = performance.now();
      const r = evaluate(s);
      const dt = performance.now() - t0;
      expect(dt, s).toBeLessThan(300);
      expect(typeof r.ok).toBe("boolean");
    }
  });

  it("cost budget stops repeated heavy calls", () => {
    const e = err("ncr(99999, 49999)+ncr(99999, 49999)");
    expect(["overflow"]).toContain(e.code);
  });
});

describe("hostile characters", () => {
  it("control characters are rejected with a position and never echoed raw", () => {
    const e = err("1+\u00002");
    expect(e.code).toBe("syntax");
    expect(e.pos).toBe(2);
    expect(e.message).not.toContain("\u0000");
    expect(e.message).toContain("U+0000");
    expect(err("\u0007").code).toBe("syntax");
    expect(err("1\u001B[31m").code).toBe("syntax");
    expect(err("\u0085").code).toBe("syntax");
  });
  it("bidi and zero-width characters are invisible to the parser", () => {
    expect(val("1‮+‬2")).toBe("3");
    expect(val("‏1‎+​2﻿")).toBe("3");
    expect(val("⁦ 2 ⁩*3")).toBe("6");
    expect(val("1؜+2")).toBe("3");
  });
  it("RTL scripts as identifiers do not crash and report unknown_ident", () => {
    const e = err("مرحبا");
    expect(e.code).toBe("unknown_ident");
    expect(e.ident).toBe("مرحبا");
  });
  it("markup and injection strings are only ever data", () => {
    const inputs = [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      "'; DROP TABLE users; --",
      "${process.env.SECRET}",
      "constructor.constructor('return this')()",
      "__proto__",
      "toString",
      "hasOwnProperty(1)",
      "{{7*7}}",
      "`id`",
      "%s%s%s%n",
      "../../etc/passwd",
      "eval('1+1')",
      "Function('return 1')()",
    ];
    for (const s of inputs) {
      const r = evaluate(s);
      expect(r.ok, s).toBe(false);
      if (!r.ok) expect(r.error).toBeInstanceOf(CalcError);
    }
    expect(err("__proto__").code).toBe("unknown_ident");
    expect(err("toString(1)").code).toBe("unknown_ident");
    expect(err("constructor").code).toBe("unknown_ident");
  });
  it("prototype names as variables work as plain data", () => {
    expect(val("constructor = 5; constructor + 1")).toBe("6");
    expect(val("__proto__ = 2; __proto__ * 3")).toBe("6");
    const r = evaluate("hasOwnProperty = 1");
    expect(r.ok).toBe(true);
    expect(({} as Record<string, unknown>).hasOwnProperty).toBeTypeOf("function");
  });
  it("astral characters and lone surrogates do not throw", () => {
    expect(evaluate("😀").ok).toBe(false);
    expect(evaluate("1+\uD83D").ok).toBe(false);
    expect(evaluate("\uDE00").ok).toBe(false);
    expect(evaluate("𝐱").ok).toBe(false); // mathematical bold x: identifier -> unknown
    expect(err("𝐱").code).toBe("unknown_ident");
  });
  it("non-string input does not escape as an exception", () => {
    const r = evaluate(undefined as unknown as string);
    expect(r.ok).toBe(false);
    const r2 = evaluate(null as unknown as string);
    expect(r2.ok).toBe(false);
  });
});
