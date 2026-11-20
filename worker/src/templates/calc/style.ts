// Look-and-feel settings shared by the bot (/style) and the Mini App API (DEC-004, DEC-007).
// Stored as nullable TEXT columns of `users`; NULL = never chosen (the client applies the default).

export const STYLE_IDS = ["tactile", "glass", "fintech", "techno"] as const;
export type StyleId = (typeof STYLE_IDS)[number];
export const CONTRAST_VALUES = ["normal", "high"] as const;
export const DENSITY_VALUES = ["comfortable", "compact"] as const;
export const LITE_VALUES = ["auto", "on", "off"] as const;
export const FS_VALUES = ["m", "l", "xl"] as const;

export const DEFAULT_STYLE: StyleId = "tactile";

export const isStyleId = (v: unknown): v is StyleId => typeof v === "string" && (STYLE_IDS as readonly string[]).includes(v);

/** Stored value or null; anything unknown (e.g. a hand-edited row) reads as "not chosen". */
export function pickEnum<T extends string>(values: readonly T[], v: unknown): T | null {
  return typeof v === "string" && (values as readonly string[]).includes(v) ? (v as T) : null;
}
