// WCAG contrast gate over StyleTokens (DOM-free). Used by contrast.test.ts and by its negative tests.

import type { StyleTokens, TokenSet } from "../../../miniapp/src/contract/model";

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function ratio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

type Pair = readonly [fg: keyof TokenSet, bg: keyof TokenSet, min: number];

/** Normal contrast: AA text 4.5:1; the accent as a UI colour on the page 3:1. */
export const NORMAL_PAIRS: readonly Pair[] = [
  ["ink", "bg", 4.5],
  ["ink2", "bg", 4.5],
  ["ink", "surface", 4.5],
  ["ink2", "surface", 4.5],
  ["onAccent", "accent", 4.5],
  ["accent", "bg", 3],
  ["ink", "soft", 4.5],
  ["accent", "soft", 4.5],
  ["danger", "bg", 4.5],
  ["danger", "surface", 4.5],
];

/** High contrast: text pairs 7:1 (AAA); the accent on the page 4.5:1; hairlines 3:1. */
export const HIGH_PAIRS: readonly Pair[] = [
  ["ink", "bg", 7],
  ["ink2", "bg", 7],
  ["ink", "surface", 7],
  ["ink2", "surface", 7],
  ["onAccent", "accent", 7],
  ["accent", "bg", 4.5],
  ["ink", "soft", 7],
  ["accent", "soft", 7],
  ["danger", "bg", 7],
  ["danger", "surface", 7],
  ["line", "bg", 3],
];

export function checkSet(name: string, set: TokenSet, pairs: readonly Pair[]): string[] {
  const bad: string[] = [];
  for (const [fg, bg, min] of pairs) {
    const r = ratio(set[fg], set[bg]);
    if (r < min) bad.push(`${name}: ${fg} ${set[fg]} on ${bg} ${set[bg]} = ${r.toFixed(2)} (< ${min})`);
  }
  return bad;
}

/** All violations of a pack's tokens (empty = passes the gate). */
export function checkTokens(t: StyleTokens): string[] {
  return [
    ...checkSet("light", t.light, NORMAL_PAIRS),
    ...checkSet("dark", t.dark, NORMAL_PAIRS),
    ...checkSet("contrastHigh.light", t.contrastHigh.light, HIGH_PAIRS),
    ...checkSet("contrastHigh.dark", t.contrastHigh.dark, HIGH_PAIRS),
  ];
}
