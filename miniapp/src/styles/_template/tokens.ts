// @@NAME@@ tokens (style id "@@ID@@"): replace every value with the palette of your style. The contrast gate
// (worker/test/miniapp/contrast.test.ts) checks each set: normal >= 4.5:1 for text pairs and 3:1 for accent on bg;
// high contrast >= 7:1 for text pairs. Copy the same hex values into pack.css (a test verifies that every value
// here appears there).

import type { StyleTokens } from "../../contract/model";

export const templateTokens: StyleTokens = {
  light: { bg: "#fafafa", surface: "#ffffff", ink: "#111827", ink2: "#4b5563", line: "#d1d5db", accent: "#0f766e", onAccent: "#ffffff", soft: "#d9f0ec", danger: "#b91c1c" },
  dark: { bg: "#111418", surface: "#1b2027", ink: "#f3f4f6", ink2: "#a8b0bc", line: "#343c47", accent: "#4fd1c0", onAccent: "#04201c", soft: "#123b36", danger: "#ff8a8a" },
  contrastHigh: {
    light: { bg: "#ffffff", surface: "#ffffff", ink: "#000000", ink2: "#1f2937", line: "#4b5563", accent: "#0b4f49", onAccent: "#ffffff", soft: "#e6f6f3", danger: "#8f1111" },
    dark: { bg: "#000000", surface: "#0d1014", ink: "#ffffff", ink2: "#e5e7eb", line: "#9ca3af", accent: "#7be8da", onAccent: "#00130f", soft: "#0c332e", danger: "#ffb3b3" },
  },
};
