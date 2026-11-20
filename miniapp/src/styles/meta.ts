// Metadata of all four styles, available without loading any pack (the settings picker draws every style's swatch).
// DOM-free. Swatch colours of styles that are not written yet come from the design-hub prototypes
// (design-hub/prototypes/tezcalc-styles) with the brand accent of DEC-009; a pack's own swatch must equal its tokens.

import { fintechTokens } from "./fintech/tokens";
import type { StyleId, StyleMeta, SwatchColors } from "../contract/model";

const BRAND = { light: "#ab3409", dark: "#ff9254" };

const sw = (bg: string, accent: string, key: string): SwatchColors => ({ bg, accent, key });

export const STYLE_META: Record<StyleId, StyleMeta> = {
  tactile: {
    id: "tactile",
    nameKey: "style_tactile",
    swatch: { light: sw("#e3e7f0", BRAND.light, "#f2f5fb"), dark: sw("#1c2130", BRAND.dark, "#2c344c") },
  },
  glass: {
    id: "glass",
    nameKey: "style_glass",
    swatch: { light: sw("#f7e4de", BRAND.light, "#ffffff"), dark: sw("#241230", BRAND.dark, "#2f1a3d") },
  },
  fintech: {
    id: "fintech",
    nameKey: "style_fintech",
    swatch: {
      light: sw(fintechTokens.light.bg, fintechTokens.light.accent, fintechTokens.light.surface),
      dark: sw(fintechTokens.dark.bg, fintechTokens.dark.accent, fintechTokens.dark.surface),
    },
  },
  techno: {
    id: "techno",
    nameKey: "style_techno",
    swatch: { light: sw("#eaf3f1", BRAND.light, "#ffffff"), dark: sw("#06080c", BRAND.dark, "#0b0f16") },
  },
};
