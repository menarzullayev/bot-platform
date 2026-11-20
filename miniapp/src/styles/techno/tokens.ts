// Techno (HUD) tokens. Single source of truth for the contrast gate; pack.css repeats the same hex values
// (a test checks that every value here appears in pack.css).
// Brand accent = vermilion (DEC-009): light #ab3409 / dark #ff9254. Light = "daylight HUD" (design-hub techno prototype),
// dark = the primary look (near-black, warm amber-terminal inks). Green is semantic (--ok in pack.css), never the accent.

import type { StyleTokens } from "../../contract/model";

export const technoTokens: StyleTokens = {
  light: { bg: "#eaf3f1", surface: "#ffffff", ink: "#06231e", ink2: "#2f564e", line: "#a9cbc3", accent: "#ab3409", onAccent: "#ffffff", soft: "#e5e4de", danger: "#a80035" },
  dark: { bg: "#06080c", surface: "#0b0f16", ink: "#f4ebe4", ink2: "#b5a79c", line: "#4a3a30", accent: "#ff9254", onAccent: "#2a1202", soft: "#332119", danger: "#ff8099" },
  contrastHigh: {
    light: { bg: "#ffffff", surface: "#f7f3ef", ink: "#000000", ink2: "#2a1e18", line: "#5c4a40", accent: "#8a2400", onAccent: "#ffffff", soft: "#f6e9e2", danger: "#8f0030" },
    dark: { bg: "#000000", surface: "#0d0a08", ink: "#ffffff", ink2: "#e6d9cf", line: "#a58f7f", accent: "#ffb184", onAccent: "#1a0a00", soft: "#2b1a10", danger: "#ff9db8" },
  },
};
