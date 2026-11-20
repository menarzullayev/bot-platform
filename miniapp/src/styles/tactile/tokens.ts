// Tactile tokens. Single source of truth for the contrast gate; pack.css repeats the same hex values
// (a test checks that every value here appears in pack.css). Brand accent = vermilion (DEC-009).
// `line` is chosen so that a 1px control border reaches 3:1 against the page (WCAG 1.4.11): shadows alone never mark a control.

import type { StyleTokens } from "../../contract/model";

export const tactileTokens: StyleTokens = {
  light: { bg: "#e3e7f0", surface: "#e9edf5", ink: "#1b2231", ink2: "#465067", line: "#76809a", accent: "#ab3409", onAccent: "#ffffff", soft: "#f4d9cb", danger: "#b3261e" },
  dark: { bg: "#1c2130", surface: "#242b3d", ink: "#e8ecf6", ink2: "#aab3c9", line: "#626c88", accent: "#ff9254", onAccent: "#2a1202", soft: "#3a2b24", danger: "#ff9b93" },
  contrastHigh: {
    light: { bg: "#f1f3f8", surface: "#f8f9fc", ink: "#000000", ink2: "#1a2233", line: "#4a5368", accent: "#8a2905", onAccent: "#ffffff", soft: "#fbe8dd", danger: "#8f1a14" },
    dark: { bg: "#0b0e16", surface: "#141926", ink: "#ffffff", ink2: "#dde3f0", line: "#9aa4bf", accent: "#ffb184", onAccent: "#1c0b00", soft: "#33231b", danger: "#ffb3ad" },
  },
};

/** Tactile-only colours (not part of TokenSet): the key face gradient (hi -> lo) and the two shadow colours. Text must stay readable on both key faces. */
export interface Shades {
  /** Light-side shadow. */
  hi: string;
  /** Dark-side shadow. */
  lo: string;
  /** Key face, top-left. */
  keyHi: string;
  /** Key face, bottom-right. */
  keyLo: string;
}

export const tactileShades: { light: Shades; dark: Shades; contrastHigh: { light: Shades; dark: Shades } } = {
  light: { hi: "#ffffff", lo: "#b4bccf", keyHi: "#f2f5fb", keyLo: "#d6dce9" },
  dark: { hi: "#2a3148", lo: "#10131c", keyHi: "#2c344c", keyLo: "#212839" },
  contrastHigh: {
    light: { hi: "#ffffff", lo: "#b4bccf", keyHi: "#f8f9fc", keyLo: "#e8ebf3" },
    dark: { hi: "#1f2538", lo: "#000000", keyHi: "#1a2030", keyLo: "#141926" },
  },
};
