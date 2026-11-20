// Atlas bridge (DEC-010): starts a TezCalc style from an entry of the design-styles atlas.
//
//   npm run atlas-import -- <atlas-style-id> [--as <id>] [--name "<Name>"] [--force] [--dry-run]     (in worker/)
//
// Reads <DESIGN_STYLES_DIR>/styles/<atlas-style-id>/style.json (default dir: ../design-styles next to this repo) and writes
// the initial values of the pack's tokens.ts and of the token blocks of pack.css:
//   * colours: bg, surface, text -> ink, muted -> ink2, border -> line, danger. The atlas palette is the style's own scheme
//     (light or dark, detected by the luminance of bg); the other scheme and both high-contrast sets are derived from it.
//   * brand accent forced by DEC-009: light #ab3409 (on #ffffff), dark #ff9254 (on #2a1202). The atlas accents are ignored.
//   * radius -> --radius / --r-m / --r-s of pack.css; shadow, border width and fonts are kept as a comment (system fonts only).
// Every pair the contrast gate (worker/test/miniapp/style-gate.ts: AA, high contrast 7:1) rejects is repaired automatically
// by moving the text colour (or, for the forced accent, the background side) in small lightness steps; the report lists
// each repair. If the pack folder does not exist it is created first (like `npm run new-style`). An existing pack is only
// overwritten with --force. Registration in model.ts / meta.ts / registry.ts / i18n stays manual (the checklist is printed).

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROOT, STYLES_DIR, checkId, createStyle, ensureMockLine, loadGate, printManualSteps, rel, replaceTokenCss, titleCase } from "./lib/style-tools.mjs";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const valueFlags = new Set(["--as", "--name"]);
const positional = argv.filter((a, i) => !a.startsWith("--") && !valueFlags.has(argv[i - 1]));
const [atlasId] = positional;
const dry = flag("dry-run");

function die(msg, code = 1) {
  console.error(`atlas-import: ${msg}`);
  process.exit(code);
}

// ---------- colour maths ----------

const BRAND = { light: { accent: "#ab3409", onAccent: "#ffffff" }, dark: { accent: "#ff9254", onAccent: "#2a1202" } };
const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

function toRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
}
function toHsl(hex) {
  const [r, g, b] = toRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, s, l];
}
function fromHsl([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}
const mix = (a, b, t) => toHex(toRgb(a).map((v, i) => v * (1 - t) + toRgb(b)[i] * t));
const withL = (hex, l, sCap) => {
  const [h, s] = toHsl(hex);
  return fromHsl([h, sCap === undefined ? s : Math.min(s, sCap), clamp(l)]);
};

// ---------- atlas -> tokens ----------

function readAtlas() {
  const dir = process.env.DESIGN_STYLES_DIR ? resolve(process.env.DESIGN_STYLES_DIR) : resolve(ROOT, "../design-styles");
  const stylesDir = join(dir, "styles");
  if (!existsSync(stylesDir)) {
    die(`the atlas was not found at ${dir}.\n  Clone/locate the design-styles atlas and point DESIGN_STYLES_DIR at its root folder (the one that contains styles/<id>/style.json),\n  e.g.  DESIGN_STYLES_DIR=D:/Linux/Projects/design-styles npm run atlas-import -- flat`);
  }
  const file = join(stylesDir, atlasId, "style.json");
  if (!existsSync(file)) {
    const ids = readdirSync(stylesDir).filter((n) => existsSync(join(stylesDir, n, "style.json")));
    die(`atlas style "${atlasId}" not found in ${stylesDir}.\n  available (${ids.length}): ${ids.join(", ")}`);
  }
  let spec;
  try {
    spec = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    die(`${file} is not valid JSON: ${e.message}`);
  }
  const colors = spec?.tokens?.colors;
  for (const k of ["bg", "surface", "text", "muted", "border", "danger"]) {
    if (!colors || !HEX.test(String(colors[k]))) die(`${file}: tokens.colors.${k} is missing or not a #rrggbb colour`);
  }
  return { spec, colors, file };
}

const luma = (g, hex) => g.luminance(hex);

/** The native scheme of the atlas palette, the other one derived from it (lightness flip, saturation capped). */
function buildNormalSets(c, gate) {
  const native = luma(gate, c.bg) < 0.22 ? "dark" : "light";
  const lowSat = 0.3;
  const hueSrc = c.bg;
  const mk = (scheme) => {
    const isNative = scheme === native;
    const accent = BRAND[scheme].accent;
    let set;
    if (isNative) {
      set = { bg: c.bg.toLowerCase(), surface: c.surface.toLowerCase(), ink: c.text.toLowerCase(), ink2: c.muted.toLowerCase(), line: c.border.toLowerCase(), danger: c.danger.toLowerCase() };
    } else if (scheme === "light") {
      set = { bg: withL(hueSrc, 0.92, lowSat), surface: withL(hueSrc, 0.975, lowSat), ink: withL(c.text, 0.1, lowSat), ink2: withL(c.muted, 0.33, lowSat), line: withL(c.border, 0.56, lowSat), danger: "#b3261e" };
    } else {
      set = { bg: withL(hueSrc, 0.1, lowSat), surface: withL(hueSrc, 0.15, lowSat), ink: withL(c.text, 0.93, lowSat), ink2: withL(c.muted, 0.7, lowSat), line: withL(c.border, 0.4, lowSat), danger: "#ff9b93" };
    }
    set.accent = accent;
    set.onAccent = BRAND[scheme].onAccent;
    set.soft = mix(set.bg, accent, scheme === "light" ? 0.16 : 0.2);
    return set;
  };
  return { native, light: mk("light"), dark: mk("dark") };
}

/** High-contrast set for a scheme: pure bg/ink, ink-2 / line / accent / danger from the normal set, repaired later. */
function buildHighSet(normal, scheme) {
  const bg = scheme === "light" ? "#ffffff" : "#000000";
  const accent = scheme === "light" ? mix(normal.accent, "#000000", 0.2) : mix(normal.accent, "#ffffff", 0.25);
  return {
    bg,
    surface: mix(bg, normal.surface, 0.5),
    ink: scheme === "light" ? "#000000" : "#ffffff",
    ink2: normal.ink2,
    line: normal.line,
    accent,
    onAccent: normal.onAccent,
    soft: mix(bg, accent, scheme === "light" ? 0.1 : 0.16),
    danger: normal.danger,
  };
}

// ---------- repairing (the report) ----------

/** Moves the lightness of `hex` away from `against` in 1% steps until the ratio reaches `min`. Returns the new hex or null. */
function pushAway(gate, hex, against, min) {
  const [h, s, l] = toHsl(hex);
  const up = gate.luminance(against) < gate.luminance(hex) ? 1 : gate.luminance(against) > gate.luminance(hex) ? -1 : gate.luminance(against) > 0.5 ? -1 : 1;
  for (let step = 1; step <= 100; step++) {
    const cand = fromHsl([h, s, clamp(l + (up * step) / 100)]);
    if (gate.ratio(cand, against) >= min + 0.02) return cand;
  }
  const extreme = up > 0 ? "#ffffff" : "#000000";
  return gate.ratio(extreme, against) >= min ? extreme : null;
}

/**
 * Repairs one set against the pairs of the gate. Text-like tokens move away from their background; `accent` is forced
 * (normal sets), so for it the background side moves (soft, then bg). Returns the log of changes.
 */
function repairSet(gate, name, set, pairs, { accentFixed }) {
  const log = [];
  const change = (token, to, why) => {
    if (set[token] === to) return false;
    log.push({ set: name, token, from: set[token], to, why });
    set[token] = to;
    return true;
  };
  for (let round = 0; round < 40; round++) {
    let changed = false;
    for (const [fg, bg, min] of pairs) {
      if (gate.ratio(set[fg], set[bg]) >= min) continue;
      const why = `${fg} on ${bg} was ${gate.ratio(set[fg], set[bg]).toFixed(2)}, needs ${min}`;
      if (fg === "accent" && accentFixed) {
        // the brand colour stays; move the surface it sits on away from it (soft first, bg only as the last resort)
        const target = bg === "soft" ? "soft" : bg;
        const to = pushAway(gate, set[target], set.accent, min);
        if (to) changed = change(target, to, why) || changed;
      } else if (fg === "onAccent" || fg === "ink" || fg === "ink2" || fg === "danger" || fg === "line" || fg === "accent") {
        const to = pushAway(gate, set[fg], set[bg], min);
        if (to) changed = change(fg, to, why) || changed;
      }
    }
    if (!changed) break;
  }
  return log;
}

// ---------- rendering ----------

function renderTokensTs(id, name, atlasId, atlas, tokens, changes) {
  const order = ["bg", "surface", "ink", "ink2", "line", "accent", "onAccent", "soft", "danger"];
  const row = (s) => `{ ${order.map((k) => `${k}: "${s[k]}"`).join(", ")} }`;
  const t = atlas.spec.tokens;
  const ref = {
    atlasId,
    nativeScheme: tokens.native,
    radius: t.radius ?? null,
    borderWidth: t.border_width ?? null,
    shadow: t.shadow ?? null,
    fonts: t.fonts ?? null,
  };
  return `// ${name} tokens (style id "${id}"), imported from the design-styles atlas entry "${atlasId}" by \`npm run atlas-import\`.
// Single source of truth for the contrast gate (worker/test/miniapp/contrast.test.ts); pack.css repeats the same hex values
// (a test checks that every value here appears there). Brand accent = vermilion (DEC-009): light #ab3409 / dark #ff9254.
// Initial values only: ${changes.length} colour(s) were repaired to pass the gate (AA normal, 7:1 text in high contrast); refine freely.

import type { StyleTokens } from "../../contract/model";

export const ${id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())}Tokens: StyleTokens = {
  light: ${row(tokens.light)},
  dark: ${row(tokens.dark)},
  contrastHigh: {
    light: ${row(tokens.contrastHigh.light)},
    dark: ${row(tokens.contrastHigh.dark)},
  },
};

/** What the atlas entry specified besides colours (reference for kit.ts / pack.css; system fonts only, no web fonts in the Mini App). */
export const atlasReference = ${JSON.stringify(ref, null, 2).replace(/\n/g, "\n")} as const;
`;
}

/** First px values of an atlas radius string ("22px panels, 14px inner, 999px pills") -> [radius, r-m, r-s]. */
function radii(str) {
  if (typeof str !== "string") return null;
  if (/^\s*0\s*(\(|$|\s)/.test(str) && !/\d+px/.test(str)) return [0, 0, 0];
  const nums = [...str.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])).filter((n) => n < 100);
  if (!nums.length) return null;
  const big = nums[0];
  const mid = nums[1] ?? Math.round(big * 0.8);
  return [big, Math.min(mid, big), Math.max(0, Math.min(Math.round(mid * 0.7), big))];
}

// ---------- main ----------

if (flag("help") || flag("h") || !atlasId) {
  console.log('usage: npm run atlas-import -- <atlas-style-id> [--as <id>] [--name "<Name>"] [--force] [--dry-run]\n  env DESIGN_STYLES_DIR  root of the design-styles atlas (default: ../design-styles)');
  process.exit(atlasId ? 0 : 1);
}

const id = opt("as") ?? atlasId;
const atlas = readAtlas();
const name = (opt("name") ?? atlas.spec.name ?? titleCase(id)).toString().replace(/["\\\r\n]/g, "").trim();
const packDir = join(STYLES_DIR, id);
const exists = existsSync(packDir);
if (exists && !flag("force")) die(`miniapp/src/styles/${id}/ already exists. Use --as <new-id> to create another style, or --force to overwrite its tokens.`);
if (!exists) {
  const err = checkId(id);
  if (err) die(`${err}${opt("as") ? "" : "\n  (the atlas id is used as the style id; pass --as <id> to choose another)"}`);
}
if (exists && !existsSync(join(packDir, "tokens.ts"))) die(`miniapp/src/styles/${id}/ has no tokens.ts`);

const gate = await loadGate();
const normal = buildNormalSets(atlas.colors, gate);
const tokens = {
  native: normal.native,
  light: normal.light,
  dark: normal.dark,
  contrastHigh: { light: buildHighSet(normal.light, "light"), dark: buildHighSet(normal.dark, "dark") },
};

const log = [
  ...repairSet(gate, "light", tokens.light, gate.NORMAL_PAIRS, { accentFixed: true }),
  ...repairSet(gate, "dark", tokens.dark, gate.NORMAL_PAIRS, { accentFixed: true }),
  ...repairSet(gate, "contrastHigh.light", tokens.contrastHigh.light, gate.HIGH_PAIRS, { accentFixed: false }),
  ...repairSet(gate, "contrastHigh.dark", tokens.contrastHigh.dark, gate.HIGH_PAIRS, { accentFixed: false }),
];
// repairing one pair can break another (e.g. moving soft for accent affects ink on soft): the loop above runs to a fixed point
const violations = gate.checkTokens(tokens);

console.log(`atlas-import: "${atlasId}" (${atlas.spec.name ?? "?"}) -> style "${id}" (${name}); atlas palette is ${normal.native}, ${normal.native === "dark" ? "light" : "dark"} derived`);
console.log(`  brand accent forced (DEC-009): light ${BRAND.light.accent} / dark ${BRAND.dark.accent}; atlas accent ${atlas.colors.accent ?? "-"} ignored`);
if (log.length === 0) console.log("  contrast gate: every pair passed without repairs");
else {
  console.log(`  contrast gate: ${log.length} repair(s):`);
  for (const l of log) console.log(`    ${l.set}.${l.token}: ${l.from} -> ${l.to}   (${l.why})`);
}
if (violations.length) {
  console.error("atlas-import: the repaired tokens still fail the gate, nothing written:");
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log("  contrast gate: all sets pass (AA normal, 7:1 text in high contrast)");

const rad = radii(atlas.spec.tokens.radius);
if (rad) console.log(`  radius "${atlas.spec.tokens.radius}" -> --radius ${rad[0]}px, --r-m ${rad[1]}px, --r-s ${rad[2]}px`);
else console.log(`  radius "${atlas.spec.tokens.radius}" not understood: pack.css keeps the template radii`);

const clean = { light: tokens.light, dark: tokens.dark, contrastHigh: tokens.contrastHigh };
if (dry) {
  console.log(`\n[dry-run] would ${exists ? "overwrite tokens in" : "create"} miniapp/src/styles/${id}/ (tokens.ts, token blocks of pack.css${rad ? ", radii" : ""}); nothing written`);
  printManualSteps(id, name, clean);
  process.exit(0);
}

if (!exists) {
  const r = createStyle(id, name);
  console.log(`\ncreated ${r.files.join(", ")}${r.mock === "added" ? " + vi.mock line in worker/test/miniapp/contract.test.ts" : ""}`);
} else ensureMockLine(id);
writeFileSync(join(packDir, "tokens.ts"), renderTokensTs(id, name, atlasId, atlas, tokens, log));
let css = readFileSync(join(packDir, "pack.css"), "utf8");
css = replaceTokenCss(css, clean);
if (rad) css = css.replace(/:root \{ --radius: [^;]*; --r-s: [^;]*; --r-m: [^;]*; \}/, `:root { --radius: ${rad[0]}px; --r-s: ${rad[2]}px; --r-m: ${rad[1]}px; }`);
const t = atlas.spec.tokens;
const note = `/* atlas "${atlasId}": shadow ${JSON.stringify(t.shadow ?? "-")}; border ${JSON.stringify(t.border_width ?? "-")}; fonts ${JSON.stringify(t.fonts?.body ?? "-")} (system fonts only here). */\n`;
if (!css.includes(`/* atlas "${atlasId}"`)) css = css.replace(/(\/\* @@TOKENS-END@@ \*\/\n)/, `$1${note}`);
writeFileSync(join(packDir, "pack.css"), css);
console.log(`wrote ${rel(join(packDir, "tokens.ts"))} and the token blocks of ${rel(join(packDir, "pack.css"))}`);
printManualSteps(id, name, clean);
