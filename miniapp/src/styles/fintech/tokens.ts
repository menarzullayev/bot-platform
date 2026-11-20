// Fintech tokens. Single source of truth for the contrast gate; pack.css repeats the same hex values
// (a test checks that every value here appears in pack.css).

import type { StyleTokens } from "../../contract/model";

export const fintechTokens: StyleTokens = {
  light: { bg: "#ffffff", surface: "#f2f4f7", ink: "#0f1419", ink2: "#566170", line: "#cdd3db", accent: "#1565c0", onAccent: "#ffffff", soft: "#e1ecf9", danger: "#c62828" },
  dark: { bg: "#17212b", surface: "#202d3a", ink: "#f5f7fa", ink2: "#9aabbd", line: "#34475a", accent: "#5aa9ea", onAccent: "#0b1620", soft: "#1d3a54", danger: "#ff6b72" },
  contrastHigh: {
    light: { bg: "#ffffff", surface: "#f2f4f7", ink: "#000000", ink2: "#1b2733", line: "#59636f", accent: "#0a4390", onAccent: "#ffffff", soft: "#e9f1fc", danger: "#a1111a" },
    dark: { bg: "#000000", surface: "#10171e", ink: "#ffffff", ink2: "#dfe7ef", line: "#9aa7b5", accent: "#8ec5ff", onAccent: "#00111f", soft: "#10304d", danger: "#ff9aa0" },
  },
};
