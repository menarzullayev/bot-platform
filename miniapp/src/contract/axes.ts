// Applies the adaptation axes (DEC-007) to <html>. Core CSS and every pack read them from these attributes:
//   data-contrast = normal | high      (packs swap to StyleTokens.contrastHigh)
//   data-density  = comfortable|compact (core: --gap, --ctl)
//   data-lite     = auto | on | off    (core: --fx; "auto" also follows prefers-reduced-* and data-lowmem)
//   data-fs       = m | l | xl         (core: --fs, the font scale every pack multiplies its sizes by)
//   data-lowmem   = "1" on low-memory devices (set here, used only when data-lite="auto")

import { AXIS_ATTRS, type Axes } from "./model";

/** Cheap capability hint for "auto" lite mode: 2 GB or less memory, or 2 or fewer cores. */
export function isLowEndDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const n = navigator as Navigator & { deviceMemory?: number };
  return (typeof n.deviceMemory === "number" && n.deviceMemory <= 2) || (typeof n.hardwareConcurrency === "number" && n.hardwareConcurrency > 0 && n.hardwareConcurrency <= 2);
}

export function applyAxes(axes: Axes, root: HTMLElement = document.documentElement): void {
  for (const k of Object.keys(AXIS_ATTRS) as Array<keyof Axes>) root.setAttribute(AXIS_ATTRS[k], axes[k]);
  if (isLowEndDevice()) root.setAttribute("data-lowmem", "1");
  else root.removeAttribute("data-lowmem");
}
