import { describe, expect, it } from "vitest";
import { derivative, explainArithmetic, integrate, renderSteps, solveEquation, STEP_LABELS, STEP_RULES, stepLabel, type Step, type StepRule } from "../../../src/calc";
import { LANGS } from "../../../src/i18n";

const LRI = "⁦";
const PDI = "⁩";

describe("step labels", () => {
  it("every rule has a name and a template in all 7 languages", () => {
    expect(LANGS.length).toBe(7);
    for (const rule of STEP_RULES) {
      for (const lang of LANGS) {
        const l = STEP_LABELS[rule][lang];
        expect(l.name.length, `${rule}/${lang} name`).toBeGreaterThan(1);
        expect(l.tpl, `${rule}/${lang} tpl`).toContain("{before}");
        expect(l.tpl, `${rule}/${lang} tpl`).toContain("{after}");
        // placeholders are balanced
        expect((l.tpl.match(/\{/g) ?? []).length).toBe((l.tpl.match(/\}/g) ?? []).length);
        for (const m of l.tpl.matchAll(/\{(\w+)\}/g)) expect(["before", "after", "note"]).toContain(m[1]);
      }
    }
  });
  it("names are translated, not copied from English", () => {
    const same = ["simplify", "arith"] as StepRule[]; // may coincide (Cognates) - only checked for non-Latin scripts
    for (const rule of STEP_RULES) {
      const en = STEP_LABELS[rule].en.name;
      for (const lang of ["uz-cyrl", "ru", "ar"] as const) {
        expect(STEP_LABELS[rule][lang].name, `${rule}/${lang}`).not.toBe(en);
      }
      void same;
    }
  });
  it("uz-cyrl and ru names/templates use no Latin letters outside formulas and placeholders", () => {
    for (const rule of STEP_RULES) {
      for (const lang of ["uz-cyrl", "ru", "ar"] as const) {
        const { name, tpl } = STEP_LABELS[rule][lang];
        expect(/[A-Za-z]/.test(name), `${rule}/${lang} name "${name}"`).toBe(false);
        // templates may keep short formulas such as (fg)′ = f′g + fg′ but no Latin words (3+ letters in a row)
        const words = tpl.replace(/\{\w+\}/g, "").match(/[A-Za-z]{3,}/g);
        expect(words, `${rule}/${lang} tpl "${tpl}"`).toBeNull();
      }
    }
  });
  it("uz-cyrl is hand-written: Cyrillic, differs from uz-latn, uses Uzbek letters", () => {
    const all = STEP_RULES.map((r) => STEP_LABELS[r]["uz-cyrl"].name + STEP_LABELS[r]["uz-cyrl"].tpl).join("");
    expect(/[ўқғҳ]/.test(all)).toBe(true);
    expect(/[ʻʼ]/.test(all)).toBe(false);
    for (const rule of STEP_RULES) {
      if (rule !== "product" && rule !== "quotient") expect(STEP_LABELS[rule]["uz-cyrl"].tpl).not.toBe(STEP_LABELS[rule]["uz-latn"].tpl); // those two are pure formulas
      expect(STEP_LABELS[rule]["uz-cyrl"].name).not.toBe(STEP_LABELS[rule]["uz-latn"].name);
      expect(/[Ѐ-ӿ]/.test(STEP_LABELS[rule]["uz-cyrl"].name)).toBe(true);
    }
    expect(/[ўқғҳ]/.test(STEP_LABELS.power["uz-cyrl"].name + STEP_LABELS.const_mult["uz-cyrl"].tpl)).toBe(true);
  });
  it("falls back for unknown rules and languages", () => {
    expect(stepLabel("nope" as StepRule, "en").name).toBe("nope");
    expect(stepLabel("power", "xx" as never).name).toBe("Power rule");
  });
});

describe("renderSteps", () => {
  const sample: Step[] = [{ rule: "power", before: "(x³)′", after: "3x²" }];
  it("renders every language with <b> and <code>", () => {
    for (const lang of LANGS) {
      const html = renderSteps(sample, lang);
      expect(html).toContain("<b>");
      expect(html).toContain("<code>");
      expect(html.startsWith("1. <b>")).toBe(true);
      expect(html).toContain(STEP_LABELS.power[lang].name);
    }
  });
  it("shows real derivative, integral, equation and arithmetic traces in 7 languages", () => {
    const d = derivative("sin(2x)");
    const i = integrate("x e^x");
    const e = solveEquation("x^2-5x+6=0");
    const a = explainArithmetic("2+3*4");
    for (const r of [d, i, e, a]) {
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      for (const lang of LANGS) {
        const html = renderSteps(r.steps, lang);
        expect(html.length).toBeGreaterThan(20);
        // no unreplaced placeholders
        expect(html).not.toMatch(/\{(before|after|note)\}/);
        // balanced tags, only <b> and <code>
        expect((html.match(/<b>/g) ?? []).length).toBe((html.match(/<\/b>/g) ?? []).length);
        expect((html.match(/<code>/g) ?? []).length).toBe((html.match(/<\/code>/g) ?? []).length);
        expect(html.replace(/<\/?(b|code)>/g, "")).not.toMatch(/[<>]/);
      }
    }
  });
  it("isolates math with LRI/PDI only for right-to-left languages", () => {
    const ar = renderSteps(sample, "ar");
    expect(ar).toContain(`<code>${LRI}(x³)′${PDI}</code>`);
    expect(ar).toContain(`<code>${LRI}3x²${PDI}</code>`);
    for (const lang of ["uz-latn", "uz-cyrl", "ru", "en", "tr", "es"] as const) {
      const html = renderSteps(sample, lang);
      expect(html).not.toContain(LRI);
      expect(html).not.toContain(PDI);
    }
  });
  it("escapes HTML in every field (XSS)", () => {
    const evil: Step[] = [
      { rule: "sum", before: "<script>alert(1)</script>", after: 'a & b "c" </code><b>', note: "<img src=x onerror=1>" },
      { rule: "chain", before: "&lt;", after: "<", note: "</code><a href='x'>" },
      { rule: "nonexistent" as StepRule, before: "<b>", after: "</b>", note: "<i>" },
    ];
    for (const lang of LANGS) {
      const html = renderSteps(evil, lang);
      expect(html).not.toContain("<script");
      expect(html).not.toContain("<img");
      expect(html).not.toContain("<a ");
      expect(html).not.toContain("<i>");
      expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(html).toContain("a &amp; b &quot;c&quot; &lt;/code&gt;&lt;b&gt;");
      expect(html).toContain("&amp;lt;");
      // the only tags left are the ones we generate
      expect(html.replace(/<\/?(b|code)>/g, "")).not.toMatch(/[<>]/);
      // the number of <code> tags equals the number of closing tags
      expect((html.match(/<code>/g) ?? []).length).toBe((html.match(/<\/code>/g) ?? []).length);
    }
  });
  it("escapes even when the text is already wrapped for RTL", () => {
    const html = renderSteps([{ rule: "power", before: "<x>", after: "y" }], "ar");
    expect(html).toContain(`${LRI}&lt;x&gt;${PDI}`);
  });
  it("omits the note placeholder when there is no note", () => {
    const html = renderSteps([{ rule: "chain", before: "a", after: "b" }], "en");
    expect(html).not.toContain("()");
    expect(html).not.toContain("{note}");
    const withNote = renderSteps([{ rule: "chain", before: "a", after: "b", note: "u = 2x" }], "en");
    expect(withNote).toContain("<code>u = 2x</code>");
  });
  it("appends the note on its own line when the template has no slot for it", () => {
    const html = renderSteps([{ rule: "power", before: "a", after: "b", note: "n = 3" }], "en");
    expect(html.endsWith("\n<code>n = 3</code>")).toBe(true);
  });
  it("empty step list gives an empty string", () => {
    expect(renderSteps([], "en")).toBe("");
  });
});
