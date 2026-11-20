import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TOKEN_NAMES, TOKEN_VARS, type StyleTokens } from "../../../miniapp/src/contract/model";
import { STYLE_META } from "../../../miniapp/src/styles/meta";
import { fintechTokens } from "../../../miniapp/src/styles/fintech/tokens";
import { loadTokenPacks } from "./dom-src";
import { checkTokens, ratio } from "./style-gate";

const SRC = resolve(import.meta.dirname, "../../../miniapp/src");

// every folder of miniapp/src/styles with an index.ts (tactile, glass, fintech, techno, generated styles, _template):
// pack name -> tokens + the stylesheet that must repeat them. Nothing to register here (see styles/_template/README.md).
const TOKEN_PACKS: ReadonlyArray<readonly [string, StyleTokens, string]> = await loadTokenPacks();

describe("contrast gate (WCAG): StyleTokens of every pack", () => {
  it("covers every registered style and the template", () => {
    const names = TOKEN_PACKS.map(([n]) => n);
    for (const id of Object.keys(STYLE_META)) expect(names, `pack ${id}`).toContain(id);
    expect(names).toContain("_template");
  });

  it("computes WCAG ratios correctly", () => {
    expect(ratio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(ratio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(ratio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });

  for (const [name, tokens, cssPath] of TOKEN_PACKS) {
    describe(name, () => {
      it("passes AA (light, dark) and 7:1 text pairs in high contrast", () => {
        expect(checkTokens(tokens)).toEqual([]);
      });

      it("uses only #rrggbb colours in every set", () => {
        for (const set of [tokens.light, tokens.dark, tokens.contrastHigh.light, tokens.contrastHigh.dark]) {
          expect(Object.keys(set).sort()).toEqual([...TOKEN_NAMES].sort());
          for (const v of Object.values(set)) expect(v).toMatch(/^#[0-9a-f]{6}$/);
        }
      });

      it("pack.css repeats exactly these colours and declares every token variable", () => {
        const css = readFileSync(resolve(SRC, cssPath), "utf8").toLowerCase();
        for (const set of [tokens.light, tokens.dark, tokens.contrastHigh.light, tokens.contrastHigh.dark]) {
          for (const n of TOKEN_NAMES) expect(css, `${n} ${set[n]}`).toContain(`${TOKEN_VARS[n]}: ${set[n]}`);
        }
        expect(css).toContain('[data-contrast="high"]');
        expect(css).toContain('[data-theme="dark"]');
      });

      it("high contrast is at least as strong as normal for the secondary text", () => {
        expect(ratio(tokens.contrastHigh.light.ink2, tokens.contrastHigh.light.bg)).toBeGreaterThanOrEqual(ratio(tokens.light.ink2, tokens.light.bg));
        expect(ratio(tokens.contrastHigh.dark.ink2, tokens.contrastHigh.dark.bg)).toBeGreaterThanOrEqual(ratio(tokens.dark.ink2, tokens.dark.bg));
      });
    });
  }

  it("negative: the gate rejects weak colours in every set", () => {
    const weak = { ...fintechTokens.light, ink2: "#999999" }; // 2.8:1 on white
    const bad: StyleTokens = {
      light: weak,
      dark: { ...fintechTokens.dark, accent: "#2a3a4a" },
      contrastHigh: { light: { ...fintechTokens.contrastHigh.light, ink2: "#555555" }, dark: { ...fintechTokens.contrastHigh.dark, danger: "#442222" } },
    };
    const v = checkTokens(bad);
    expect(v.some((x) => x.startsWith("light:") && x.includes("ink2"))).toBe(true);
    expect(v.some((x) => x.startsWith("dark:") && x.includes("accent"))).toBe(true);
    expect(v.some((x) => x.startsWith("contrastHigh.light:") && x.includes("ink2"))).toBe(true);
    expect(v.some((x) => x.startsWith("contrastHigh.dark:") && x.includes("danger"))).toBe(true);
  });

  it("negative: a malformed colour is an error, not a pass", () => {
    expect(() => checkTokens({ ...fintechTokens, light: { ...fintechTokens.light, ink: "black" } })).toThrow();
  });

  it("the fintech swatch equals its tokens", () => {
    const s = STYLE_META.fintech.swatch;
    expect(s.light).toEqual({ bg: fintechTokens.light.bg, accent: fintechTokens.light.accent, key: fintechTokens.light.surface });
    expect(s.dark).toEqual({ bg: fintechTokens.dark.bg, accent: fintechTokens.dark.accent, key: fintechTokens.dark.surface });
  });

  it("every style has a complete swatch (#rrggbb, light and dark)", () => {
    for (const meta of Object.values(STYLE_META)) {
      expect(meta.nameKey).toBe(`style_${meta.id}`);
      for (const scheme of [meta.swatch.light, meta.swatch.dark]) for (const c of [scheme.bg, scheme.accent, scheme.key]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
