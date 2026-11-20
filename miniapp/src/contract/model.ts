// DOM-free part of the style contract: ids, metadata, tokens and the four adaptation axes (DEC-007).
// Kept free of DOM types on purpose: tests and the contrast gate import it without a DOM environment.

export const STYLE_IDS = ["tactile", "glass", "fintech", "techno"] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export const DEFAULT_STYLE: StyleId = "tactile";
/** The style every failure falls back to (it is the one that always ships). */
export const FALLBACK_STYLE: StyleId = "fintech";

export function isStyleId(v: unknown): v is StyleId {
  return typeof v === "string" && (STYLE_IDS as readonly string[]).includes(v);
}

// ---------- metadata ----------

/** One colour triple used for the mini preview in the style picker. All hex (#rrggbb). */
export interface SwatchColors {
  bg: string;
  accent: string;
  key: string;
}

export interface StyleMeta {
  id: StyleId;
  /** Key in strings.ts (MS) with the localized style name. */
  nameKey: `style_${StyleId}`;
  swatch: { light: SwatchColors; dark: SwatchColors };
}

// ---------- tokens ----------

/** Colours every pack must define. Hex only (#rrggbb): the contrast gate reads them. */
export interface TokenSet {
  /** Page background. */
  bg: string;
  /** Raised surface: cards, keys, inputs. */
  surface: string;
  /** Primary text. */
  ink: string;
  /** Secondary text (hints, labels). */
  ink2: string;
  /** Hairlines and borders. */
  line: string;
  /** Brand/interaction colour. Also used as text colour on bg/surface/soft. */
  accent: string;
  /** Text/icon colour on top of `accent`. */
  onAccent: string;
  /** Tinted background for selected/active states; ink and accent must stay readable on it. */
  soft: string;
  /** Error/destructive text colour; must stay readable on bg and surface. */
  danger: string;
}

export const TOKEN_NAMES = ["bg", "surface", "ink", "ink2", "line", "accent", "onAccent", "soft", "danger"] as const satisfies ReadonlyArray<keyof TokenSet>;

export interface StyleTokens {
  light: TokenSet;
  dark: TokenSet;
  /** Overrides used when the contrast axis is "high"; text pairs must reach 7:1. */
  contrastHigh: { light: TokenSet; dark: TokenSet };
}

/** CSS custom property each token is published as (pack.css declares them; core and kits read them). */
export const TOKEN_VARS: Record<keyof TokenSet, string> = {
  bg: "--bg",
  surface: "--surface",
  ink: "--ink",
  ink2: "--ink-2",
  line: "--line",
  accent: "--accent",
  onAccent: "--on-accent",
  soft: "--soft",
  danger: "--danger",
};

// ---------- adaptation axes (DEC-007) ----------

export const CONTRASTS = ["normal", "high"] as const;
export const DENSITIES = ["comfortable", "compact"] as const;
export const LITES = ["auto", "on", "off"] as const;
export const FONT_SIZES = ["m", "l", "xl"] as const;

export type Contrast = (typeof CONTRASTS)[number];
export type Density = (typeof DENSITIES)[number];
export type Lite = (typeof LITES)[number];
export type FontSize = (typeof FONT_SIZES)[number];

export interface Axes {
  contrast: Contrast;
  density: Density;
  /** auto = follow prefers-reduced-transparency/motion and low device memory; on/off force it. */
  lite: Lite;
  fs: FontSize;
}

export const DEFAULT_AXES: Axes = { contrast: "normal", density: "comfortable", lite: "auto", fs: "m" };

export const isContrast = (v: unknown): v is Contrast => (CONTRASTS as readonly unknown[]).includes(v);
export const isDensity = (v: unknown): v is Density => (DENSITIES as readonly unknown[]).includes(v);
export const isLite = (v: unknown): v is Lite => (LITES as readonly unknown[]).includes(v);
export const isFontSize = (v: unknown): v is FontSize => (FONT_SIZES as readonly unknown[]).includes(v);

/** Validates untrusted input (localStorage, server). Unknown or null values become the defaults. */
export function parseAxes(raw: unknown): Axes {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    contrast: isContrast(o.contrast) ? o.contrast : DEFAULT_AXES.contrast,
    density: isDensity(o.density) ? o.density : DEFAULT_AXES.density,
    lite: isLite(o.lite) ? o.lite : DEFAULT_AXES.lite,
    fs: isFontSize(o.fs) ? o.fs : DEFAULT_AXES.fs,
  };
}

/** html attributes that carry the axes. Packs and core.css select on them. */
export const AXIS_ATTRS = { contrast: "data-contrast", density: "data-density", lite: "data-lite", fs: "data-fs" } as const;

// ---------- share card (DEC-011, DEC-014) ----------

/** What a share card shows. Every field is plain, already localized text. */
export const SHARE_KINDS = ["calc", "convert", "loan"] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

export interface ShareData {
  kind: ShareKind;
  /** Small caption (the tool: Calculator, Converter, Loan ...). */
  title: string;
  /** The hero value: a result, a converted amount, a monthly payment. Drawn left-to-right (isolated) in every language. */
  main: string;
  /** Context under the hero: the expression, "100 km to mi", the payment caption. May wrap to two lines. */
  sub: string;
  /** One quiet line at the bottom (date, rate, totals). May be empty. */
  footer: string;
}

/** Card size in px. The canvas is drawn at devicePixelRatio 1, so one unit is one pixel of the JPEG. */
export interface ShareSize {
  w: number;
  h: number;
}

/** The share card is always this size (16:9, small enough for a <= 60 KB JPEG, large enough to read in a chat). */
export const SHARE_SIZE: ShareSize = { w: 720, h: 405 };
