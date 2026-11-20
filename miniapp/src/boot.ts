// Boot script (classic script, runs before the first paint): puts the cached theme, language direction, style and
// adaptation axes on <html> so the page never flashes the wrong look while main.ts and the style pack load.
// Reads the same localStorage record as ui/state.ts ("tc:prefs"). Kept tiny: it only imports pure helpers.
// A plain external file (not inline) because the page CSP is script-src 'self'.

import { applyAxes } from "./contract/axes";
import { DEFAULT_STYLE, isStyleId, parseAxes } from "./contract/model";

try {
  const raw = JSON.parse(window.localStorage.getItem("tc:prefs") ?? "{}") as Record<string, unknown>;
  const root = document.documentElement;
  if (raw.theme === "light" || raw.theme === "dark") root.setAttribute("data-theme", raw.theme);
  if (raw.lang === "ar") root.dir = "rtl";
  root.setAttribute("data-style", isStyleId(raw.style) ? raw.style : DEFAULT_STYLE);
  applyAxes(parseAxes(raw), root);
} catch {
  /* storage blocked or corrupt: main.ts applies the defaults */
}
