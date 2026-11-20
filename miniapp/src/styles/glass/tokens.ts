// Glass tokens. Single source of truth for the contrast gate; pack.css repeats the same hex values
// (a test checks that every value here appears in pack.css).
//
// A glass surface is a translucent "scrim" over the mesh background, so what the user really sees is the BLENDED colour.
// `bg` is the mesh base colour and `surface` is the scrim blended over it (the effective colours, not the raw rgba), and
// the gate computes contrast from them. style-glass.test.ts additionally blends every scrim over every mesh stop (the
// worst spots of the gradient) and checks the text there too.

import type { StyleTokens } from "../../contract/model";

export const glassTokens: StyleTokens = {
  light: { bg: "#f7e4de", surface: "#fdf5f2", ink: "#2b1510", ink2: "#654338", line: "#e3c2b6", accent: "#ab3409", onAccent: "#ffffff", soft: "#f9e1d6", danger: "#a31f19" },
  dark: { bg: "#241230", surface: "#291733", ink: "#fbf3ff", ink2: "#cdbcd8", line: "#5a3a66", accent: "#ff9254", onAccent: "#2a1202", soft: "#4a2830", danger: "#ff9b94" },
  contrastHigh: {
    light: { bg: "#fff4ee", surface: "#ffffff", ink: "#000000", ink2: "#3a2018", line: "#6b3a2a", accent: "#8a2300", onAccent: "#ffffff", soft: "#fbebe4", danger: "#8f0f0a" },
    dark: { bg: "#000000", surface: "#130a18", ink: "#ffffff", ink2: "#eadff0", line: "#b9a3c4", accent: "#ffb386", onAccent: "#1a0a00", soft: "#331c12", danger: "#ffb4ae" },
  },
};

/** Second end of the "=" gradient (accent -> accent-2). Not a contract token; on-accent must stay readable on it too. */
export const glassAccent2 = { light: "#b4231f", dark: "#ff6f91", highLight: "#9b1c17", highDark: "#ff8aa8" } as const;

/**
 * Raw glass recipe, per scheme: the scrim colour (rgb) with its alpha for the three strengths (surfaces and keys, fields,
 * sheet), and the mesh gradient stops. pack.css repeats these literals; the test blends them to prove the contrast.
 */
export const glassRecipe = {
  light: { scrim: "#fffaf8", fieldScrim: "#ffffff", alpha: { surface: 0.78, field: 0.9, sheet: 0.94 }, mesh: ["#ffc9a8", "#ffb8d4", "#d6c4ff", "#ffd9a0"] },
  dark: { scrim: "#2a1834", fieldScrim: "#1a0d24", alpha: { surface: 0.78, field: 0.9, sheet: 0.94 }, mesh: ["#4a1c5e", "#7a2340", "#1d2a70", "#6a3010"] },
} as const;
