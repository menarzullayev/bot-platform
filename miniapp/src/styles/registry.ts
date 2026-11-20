// Style registry: which packs exist, lazy loading (each pack is a dynamic import(), so esbuild splitting ships only
// the chosen one), and applying a pack to the document.
//
// Adding a style = write styles/<id>/ (copy styles/_template), then replace its `null` below with a loader.
// A style without a loader is "not available": it is listed (so the picker can show it with a "soon" badge) but
// loadStyle() falls back to FALLBACK_STYLE, so the app works whichever style the user (or the default) asks for.

import { DEFAULT_STYLE, FALLBACK_STYLE, STYLE_IDS, type Kit, type StyleId, type StyleMeta, type StylePack } from "../contract/types";
import { STYLE_META } from "./meta";

export { DEFAULT_STYLE, FALLBACK_STYLE, STYLE_IDS };

export type StyleLoader = () => Promise<{ default: StylePack }>;

const LOADERS: Record<StyleId, StyleLoader | null> = {
  tactile: () => import("./tactile/index"),
  glass: () => import("./glass/index"),
  fintech: () => import("./fintech/index"),
  techno: () => import("./techno/index"),
};

const cache = new Map<StyleId, StylePack>();

/** Test/dev hook: install or remove a loader (null = style not available). Clears the cached pack. */
export function setStyleLoader(id: StyleId, loader: StyleLoader | null): void {
  LOADERS[id] = loader;
  cache.delete(id);
}

export function isAvailable(id: StyleId): boolean {
  return LOADERS[id] !== null;
}

export interface StyleListItem {
  meta: StyleMeta;
  /** false = no pack yet (the picker shows a "soon" badge; selecting it is not possible). */
  available: boolean;
}

/** All styles in picker order, with their availability. */
export function listStyles(): StyleListItem[] {
  return STYLE_IDS.map((id) => ({ meta: STYLE_META[id], available: isAvailable(id) }));
}

/** The style that will actually be shown for a preference: itself when available, otherwise the fallback. */
export function effectiveStyle(id: StyleId): StyleId {
  return isAvailable(id) ? id : FALLBACK_STYLE;
}

async function loadOne(id: StyleId): Promise<StylePack> {
  const hit = cache.get(id);
  if (hit) return hit;
  const loader = LOADERS[id];
  if (!loader) throw new Error(`style "${id}" is not available`);
  const pack = (await loader()).default;
  cache.set(id, pack);
  return pack;
}

/** Loads a pack. Unavailable or failing packs fall back to FALLBACK_STYLE; only a failing fallback rejects. */
export async function loadStyle(id: StyleId): Promise<StylePack> {
  try {
    return await loadOne(id);
  } catch (e) {
    if (id === FALLBACK_STYLE) throw e;
    return loadOne(FALLBACK_STYLE);
  }
}

// ---------- applying ----------

export const STYLE_ELEMENT_ID = "style-pack";
/** How long to wait for a stylesheet file before showing the page anyway. */
const CSS_WAIT_MS = 4000;

let current: StylePack | null = null;
const listeners = new Set<(pack: StylePack, prev: StylePack | null) => void>();

export function currentPack(): StylePack | null {
  return current;
}

export function currentKit(): Kit {
  if (!current) throw new Error("no style applied yet");
  return current.kit;
}

/** Called after a different pack was applied (CSS swapped, attribute set); pages re-render with the new kit. */
export function onStyleChange(fn: (pack: StylePack, prev: StylePack | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Builds the single stylesheet element of a pack (<link>: inline <style> is blocked by the CSP). */
function styleElement(pack: StylePack): { el: HTMLLinkElement; ready: Promise<void> } {
  const el = document.createElement("link");
  el.id = STYLE_ELEMENT_ID;
  el.rel = "stylesheet";
  el.href = pack.cssHref;
  const ready = new Promise<void>((done) => {
    const timer = window.setTimeout(done, CSS_WAIT_MS);
    const fin = (): void => {
      window.clearTimeout(timer);
      done();
    };
    el.addEventListener("load", fin);
    el.addEventListener("error", fin);
  });
  return { el, ready };
}

let seq = 0;
let activeEl: Element | null = null;

/**
 * Makes `pack` the active style: `data-style` on <html>, its stylesheet in one <link> with id "style-pack" (the previous
 * one is removed), then notifies `onStyleChange` listeners. Applying the active pack again is a no-op.
 * Resolves when the stylesheet is ready; a later call supersedes an earlier one that is still loading.
 */
export async function applyStyle(pack: StylePack): Promise<void> {
  if (current === pack && activeEl?.isConnected) return;
  const my = ++seq;
  const { el, ready } = styleElement(pack);
  if (activeEl?.isConnected) activeEl.after(el);
  else document.head.appendChild(el);
  await ready;
  if (my !== seq) {
    el.remove();
    return;
  }
  activeEl?.remove();
  activeEl = el;
  const prev = current;
  current = pack;
  document.documentElement.setAttribute("data-style", pack.meta.id);
  if (prev === pack) return;
  for (const fn of [...listeners]) {
    try {
      fn(pack, prev);
    } catch {
      /* a failing listener must not block the style change */
    }
  }
}
