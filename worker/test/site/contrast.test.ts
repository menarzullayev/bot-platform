// WCAG AA gate for the landing tokens: style x theme. Text 4.5:1, accent used as UI/large text 3:1 (we ask for 4.5 anyway).
import { describe, expect, it } from "vitest";
import { TOKENS } from "../../../site/build.mjs";

const ACCENT = { light: { accent: "#ab3409", on: "#ffffff" }, dark: { accent: "#ff9254", on: "#2a1202" } } as const;
const SOFT = { light: 0.08, dark: 0.18 } as const;

type RGB = [number, number, number];
function parse(c: string): { rgb: RGB; a: number } {
  const h = /^#([0-9a-f]{6})$/i.exec(c);
  if (h) return { rgb: [0, 2, 4].map((i) => parseInt(h[1].slice(i, i + 2), 16)) as RGB, a: 1 };
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(c);
  if (!m) throw new Error("bad colour " + c);
  return { rgb: [+m[1], +m[2], +m[3]], a: +m[4] };
}
const over = (top: string, under: RGB): RGB => {
  const t = parse(top);
  return t.rgb.map((v, i) => Math.round(v * t.a + under[i] * (1 - t.a))) as RGB;
};
const mix = (a: RGB, b: RGB, p: number): RGB => a.map((v, i) => Math.round(v * p + b[i] * (1 - p))) as RGB;
const lum = ([r, g, b]: RGB): number => {
  const f = (x: number) => ((x /= 255) <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: RGB, b: RGB): number => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
const hex = (c: string): RGB => parse(c).rgb;

const CASES = (["tactile", "glass", "fintech", "techno"] as const).flatMap((s) => (["light", "dark"] as const).map((t) => [s, t] as const));

describe.each(CASES)("%s / %s", (style, theme) => {
  const t = TOKENS[style][theme];
  const a = ACCENT[theme];
  // surfaces text can sit on: page bg, display, keys (gradient ends), glass keys over the mesh colours
  // glass keys use the translucent --glass colour instead of the key gradient
  const surfaces: [string, RGB][] = [["bg", hex(t.bg)], ["surface", hex(t.surface)]];
  if (!t.glass) surfaces.push(["keyHi", hex(t.keyHi)], ["keyLo", hex(t.keyLo)]);
  if (t.glass) for (const k of ["bg", "m1", "m2", "m3"]) surfaces.push([`glass over ${k}`, over(t.glass, hex(k === "bg" ? t.bg : (t as Record<string, string>)[k]))]);
  const soft = mix(hex(a.accent), hex(t.bg), SOFT[theme]);

  it("ink and ink-2 on every surface are >= 4.5:1", () => {
    for (const [n, s] of surfaces) {
      expect(ratio(hex(t.ink), s), `ink on ${n}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(hex(t.ink2), s), `ink-2 on ${n}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("accent text and links on every surface are >= 4.5:1", () => {
    for (const [n, s] of surfaces) expect(ratio(hex(a.accent), s), `accent on ${n}`).toBeGreaterThanOrEqual(4.5);
  });
  it("text on the accent button is >= 4.5:1 and the glass gradient end (accent-2) keeps it", () => {
    expect(ratio(hex(a.on), hex(a.accent))).toBeGreaterThanOrEqual(4.5);
  });
  it("hover/soft background keeps ink and accent readable", () => {
    expect(ratio(hex(t.ink), soft)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(hex(a.accent), soft)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("accent-2 (glass equals key gradient end)", () => {
  it("on-accent text on accent-2 stays >= 3:1 (large key glyph)", () => {
    expect(ratio(hex("#ffffff"), hex("#b4231f"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(hex("#2a1202"), hex("#ff6f91"))).toBeGreaterThanOrEqual(4.5);
  });
});
