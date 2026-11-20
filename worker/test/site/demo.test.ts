// @vitest-environment happy-dom
// @ts-nocheck: DOM globals; the worker tsconfig has no DOM lib (it would clash with the Workers types)
// Runs the real landing page markup + site/src/app.js: keypad, exact decimal arithmetic, style picker, theme toggle.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildToTmp, type Built } from "./helpers";

let b: Built;
beforeAll(async () => {
  b = await buildToTmp();
}, 60_000);
afterAll(() => b.cleanup());

function mount(lang: string) {
  const html = b.html(lang, "");
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-style");
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)[1].replace(/<script[^>]*><\/script>/g, "");
  // app.js is an IIFE: evaluate it fresh against the new DOM
  (0, eval)(readFileSync(join(b.dir, "site", b.result.appName), "utf8"));
}
const press = (...keys: string[]) => {
  for (const k of keys) document.querySelector(`[data-k="${k}"]`).click();
};
const res = () => document.getElementById("d-res").textContent;
const expr = () => document.getElementById("d-expr").textContent;
const chip = (e: string) => press("AC", ...e.split(""));

beforeEach(() => {
  localStorage.clear();
});

describe("demo calculator (en: '.' decimal, ',' grouping)", () => {
  beforeEach(() => mount("en"));

  it("starts with the exact 0.1+0.2 = 0.3 example", () => {
    expect(res()).toBe("0.3");
    expect(expr()).toBe("0.1+0.2");
  });

  it("keypad: 1200 + 15% = 1,380 (percent of the left side)", () => {
    press("AC", "1", "2", "0", "0", "+", "1", "5", "%");
    expect(res()).toBe("1,380");
    press("=");
    expect(expr()).toBe("1380");
  });

  it.each([
    ["0.1+0.2", "0.3"],
    ["0.3-0.1", "0.2"],
    ["1.1*1.1", "1.21"],
    ["0.1*3", "0.3"],
    ["1/3*3", "1"],
    ["1/8", "0.125"],
    ["200-10%", "180"],
    ["50%", "0.5"],
    ["480*15%", "72"],
    ["(3+4)*5", "35"],
    ["-5+2", "−3"],
    ["1000000*1000000", "1,000,000,000,000"],
    ["0.1+0.7", "0.8"],
    ["4.35*100", "435"],
  ])("%s = %s", (e, want) => {
    chip(e);
    expect(res()).toBe(want);
  });

  it("division by zero shows the localized error, incomplete input shows an ellipsis", () => {
    press("AC", "1", "/", "0");
    expect(res()).toBe("Error");
    press("AC", "1", "+");
    expect(res()).toBe("…");
  });

  it("input guards: one dot per number, operators replace each other, no leading operator, backspace, clear", () => {
    press("AC", "1", ".", ".", "5");
    expect(expr()).toBe("1.5");
    press("+", "*");
    expect(expr()).toBe("1.5×");
    press("AC", "*");
    expect(expr()).toBe("0");
    press("7", "8", "BS");
    expect(expr()).toBe("7");
    press("AC");
    expect(res()).toBe("0");
  });

  it("typing a digit after = starts a new calculation, an operator continues", () => {
    press("AC", "2", "+", "3", "=");
    expect(expr()).toBe("5");
    press("*", "2");
    expect(res()).toBe("10");
    press("=", "7");
    expect(expr()).toBe("7");
  });

  it("the expression is capped at 40 characters", () => {
    press("AC");
    for (let i = 0; i < 60; i++) press("9");
    expect(expr().length).toBe(40);
  });
});

describe("localized number format", () => {
  it("uz: comma decimal and non-breaking-space grouping; tr: dot grouping", () => {
    mount("uz-latn");
    expect(res()).toBe("0,3");
    chip("1200+15%");
    expect(res()).toBe("1 380");
    mount("tr");
    chip("1200+15%");
    expect(res()).toBe("1.380");
    chip("0.1+0.2");
    expect(res()).toBe("0,3");
  });
  it("ar keeps Latin digits and a LTR display", () => {
    mount("ar");
    expect(res()).toBe("0.3");
    expect(document.querySelector(".d-display")).not.toBeNull();
  });
});

describe("style picker and theme toggle", () => {
  beforeEach(() => mount("en"));
  it("switching the demo style sets data-style on <html>, aria-pressed and persists", () => {
    expect(document.documentElement.getAttribute("data-style")).toBe("tactile");
    for (const s of ["glass", "fintech", "techno", "tactile"]) {
      document.querySelector(`[data-style-btn="${s}"]`).click();
      expect(document.documentElement.getAttribute("data-style")).toBe(s);
      expect(document.querySelector(`[data-style-btn="${s}"]`).getAttribute("aria-pressed")).toBe("true");
      expect(document.querySelectorAll('[data-style-btn][aria-pressed="true"]').length).toBe(1);
      expect(localStorage.getItem("tc-style")).toBe(s);
    }
  });
  it("the theme button sets an explicit light/dark theme and remembers it", () => {
    const btn = document.getElementById("theme-btn");
    btn.click();
    const first = document.documentElement.getAttribute("data-theme");
    expect(["light", "dark"]).toContain(first);
    btn.click();
    const second = document.documentElement.getAttribute("data-theme");
    expect(second).not.toBe(first);
    expect(localStorage.getItem("tc-theme")).toBe(second);
  });
  it("boot script restores the saved theme and style before paint", () => {
    localStorage.setItem("tc-theme", "dark");
    localStorage.setItem("tc-style", "techno");
    (0, eval)(readFileSync(join(b.dir, "site", b.result.bootName), "utf8"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-style")).toBe("techno");
    localStorage.setItem("tc-theme", "<bad>");
    document.documentElement.removeAttribute("data-theme");
    (0, eval)(readFileSync(join(b.dir, "site", b.result.bootName), "utf8"));
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });
});
