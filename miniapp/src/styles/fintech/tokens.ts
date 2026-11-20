// Fintech tokens. Single source of truth for the contrast gate; pack.css repeats the same hex values
// (a test checks that every value here appears in pack.css).

import type { StyleTokens } from "../../contract/model";

export const fintechTokens: StyleTokens = {
  light: { bg: "#ffffff", surface: "#f2f4f7", ink: "#0f1419", ink2: "#566170", line: "#cdd3db", accent: "#ab3409", onAccent: "#ffffff", soft: "#f8efeb", danger: "#c62828" },
  dark: { bg: "#17212b", surface: "#202d3a", ink: "#f5f7fa", ink2: "#9aabbd", line: "#34475a", accent: "#ff9254", onAccent: "#2a1202", soft: "#413532", danger: "#ff6b72" },
  contrastHigh: {
    light: { bg: "#ffffff", surface: "#f2f4f7", ink: "#000000", ink2: "#1b2733", line: "#59636f", accent: "#8a2704", onAccent: "#ffffff", soft: "#f8f2f0", danger: "#a1111a" },
    dark: { bg: "#000000", surface: "#10171e", ink: "#ffffff", ink2: "#dfe7ef", line: "#9aa7b5", accent: "#ffb48a", onAccent: "#1a0a00", soft: "#241913", danger: "#ff9aa0" },
  },
};
