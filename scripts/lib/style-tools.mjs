// Shared helpers of the style tools (scripts/new-style.mjs, scripts/atlas-import.mjs). Node only, no dependencies
// except esbuild (a devDependency of worker/, used to load the contrast gate from its TypeScript source).
// Nothing here edits registered code: registration of a style in model.ts / meta.ts / registry.ts / i18n stays a manual,
// reviewed step (DEC-010); the tools only create the pack folder, the test-list lines and print the manual checklist.

import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "../..");
export const STYLES_DIR = join(ROOT, "miniapp/src/styles");
export const TEMPLATE_DIR = join(STYLES_DIR, "_template");
export const CONTRACT_TEST = join(ROOT, "worker/test/miniapp/contract.test.ts");
export const ID_RE = /^[a-z][a-z0-9-]{2,20}$/;
/** Files of the template that become the new pack (README.md stays in the template). */
export const PACK_FILES = ["index.ts", "kit.ts", "pack.css", "tokens.ts"];

const rel = (p) => relative(ROOT, p).replace(/\\/g, "/");
export { rel };

// ---------- reading the project ----------

/** The registered style ids (contract/model.ts STYLE_IDS). */
export function registeredIds() {
  const src = readFileSync(join(ROOT, "miniapp/src/contract/model.ts"), "utf8");
  const m = /STYLE_IDS\s*=\s*\[([^\]]*)\]/.exec(src);
  if (!m) throw new Error("cannot read STYLE_IDS from miniapp/src/contract/model.ts");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/** Folder names under styles/ that hold a pack (`_template` included, it is a reference pack). */
export function packDirs() {
  return readdirSync(STYLES_DIR).filter((n) => statSync(join(STYLES_DIR, n)).isDirectory() && existsSync(join(STYLES_DIR, n, "index.ts")));
}

export function camel(id) {
  return id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

export function titleCase(id) {
  return id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

/** Validates a new style id; returns an error text or "". */
export function checkId(id) {
  if (!id) return "missing style id";
  if (!ID_RE.test(id)) return `bad id "${id}": it must match ${ID_RE} (3-21 chars, lowercase letters, digits and dashes, starting with a letter)`;
  if (id.startsWith("_")) return "ids starting with _ are reserved";
  if (registeredIds().includes(id)) return `"${id}" is already a registered style (STYLE_IDS)`;
  if (existsSync(join(STYLES_DIR, id))) return `miniapp/src/styles/${id}/ already exists`;
  return "";
}

// ---------- skeleton ----------

function fill(text, id, name) {
  const c = camel(id);
  return text
    .replaceAll("@@NAME@@", name)
    .replaceAll("@@ID@@", id)
    .replace(/\btemplate(Kit|Tokens)\b/g, `${c}$1`)
    .replace(/\/\/ placeholder id: use your own style id here.*$/m, `// TODO(${id}): after adding "${id}" to STYLE_IDS and styles/meta.ts use STYLE_META.${id} (see npm run new-style output)`);
}

/**
 * The files of a new pack: [{ path (absolute), text }]. Pure (nothing written). Throws if the template lost a marker
 * the generator relies on.
 */
export function skeletonFiles(id, name) {
  const out = [];
  for (const f of PACK_FILES) {
    const src = readFileSync(join(TEMPLATE_DIR, f), "utf8");
    const text = fill(src, id, name);
    if (f === "index.ts" && !text.includes(`TODO(${id})`)) throw new Error("_template/index.ts: the placeholder meta note is gone; update scripts/lib/style-tools.mjs");
    if (f === "pack.css" && !text.includes("@@TOKENS-BEGIN@@")) throw new Error("_template/pack.css: token markers are gone; update scripts/lib/style-tools.mjs");
    if (text.includes("@@NAME@@") || text.includes("@@ID@@")) throw new Error(`${f}: unreplaced placeholder`);
    out.push({ path: join(STYLES_DIR, id, f), text });
  }
  return out;
}

/** The vi.mock line contract.test.ts needs for a pack (vite cannot serve pack.css?url, see the comment in that file). */
export function viMockLine(id) {
  return `vi.mock("../../../miniapp/src/styles/${id}/pack.css?url", () => ({ default: "/app/pack-${id}.css" }));`;
}

/** Adds the vi.mock line to contract.test.ts. Returns "added" | "present"; throws when the anchor is missing. */
export function ensureMockLine(id, { dry = false } = {}) {
  const src = readFileSync(CONTRACT_TEST, "utf8");
  const line = viMockLine(id);
  if (src.includes(line)) return "present";
  const lines = src.split("\n");
  let last = -1;
  lines.forEach((l, i) => {
    if (l.startsWith('vi.mock("../../../miniapp/src/styles/') && l.includes("/pack.css?url")) last = i;
  });
  if (last < 0) throw new Error(`${rel(CONTRACT_TEST)}: no vi.mock(".../pack.css?url") line to anchor on`);
  lines.splice(last + 1, 0, line);
  if (!dry) writeFileSync(CONTRACT_TEST, lines.join("\n"));
  return "added";
}

/** Creates the pack folder and the test-list line. Returns what was (or, in a dry run, would be) written. */
export function createStyle(id, name, { dry = false } = {}) {
  const err = checkId(id);
  if (err) throw new Error(err);
  const files = skeletonFiles(id, name);
  if (!dry) {
    mkdirSync(join(STYLES_DIR, id), { recursive: true });
    for (const f of files) writeFileSync(f.path, f.text);
  }
  const mock = ensureMockLine(id, { dry });
  return { files: files.map((f) => rel(f.path)), mock };
}

// ---------- tokens ----------

/** pack.css token blocks (light, dark system + explicit, high contrast in all three forms), same shape as the template. */
export function renderTokenCss(t) {
  const vars = (s, scheme) => `--bg: ${s.bg}; --surface: ${s.surface}; --ink: ${s.ink}; --ink-2: ${s.ink2}; --line: ${s.line}; --accent: ${s.accent}; --on-accent: ${s.onAccent}; --soft: ${s.soft}; --danger: ${s.danger};${scheme ? ` color-scheme: ${scheme};` : ""}`;
  const hl = t.contrastHigh.light;
  const hd = t.contrastHigh.dark;
  return [
    `:root { ${vars(t.light, "light")} }`,
    `@media (prefers-color-scheme: dark) {`,
    `  :root:not([data-theme="light"]) { ${vars(t.dark, "dark")} }`,
    `}`,
    `:root[data-theme="light"] { ${vars(t.light, "light")} }`,
    `:root[data-theme="dark"] { ${vars(t.dark, "dark")} }`,
    `:root[data-contrast="high"] { ${vars(hl)} }`,
    `@media (prefers-color-scheme: dark) {`,
    `  :root[data-contrast="high"]:not([data-theme="light"]) { ${vars(hd)} }`,
    `}`,
    `:root[data-contrast="high"][data-theme="dark"] { ${vars(hd)} }`,
    `:root[data-contrast="high"][data-theme="light"] { ${vars(hl)} }`,
  ].join("\n");
}

/** Replaces the token region of a pack.css (between the generator markers). */
export function replaceTokenCss(css, tokens) {
  const a = css.indexOf("/* @@TOKENS-BEGIN@@");
  const b = css.indexOf("/* @@TOKENS-END@@ */");
  if (a < 0 || b < 0 || b < a) throw new Error("pack.css has no @@TOKENS-BEGIN@@ / @@TOKENS-END@@ markers");
  const headEnd = css.indexOf("\n", a) + 1;
  return css.slice(0, headEnd) + renderTokenCss(tokens) + "\n" + css.slice(b);
}

/** Reads the four colour sets back from a tokens.ts written in the template layout (light, dark, contrastHigh.light, contrastHigh.dark). */
export function parseTokensTs(text) {
  const sets = [...text.matchAll(/\{\s*bg:\s*"#[0-9a-fA-F]{6}"[^}]*\}/g)].map((m) => Object.fromEntries([...m[0].matchAll(/(\w+):\s*"(#[0-9a-fA-F]{6})"/g)].map((x) => [x[1], x[2].toLowerCase()])));
  if (sets.length !== 4) throw new Error(`tokens.ts: expected 4 colour sets, found ${sets.length}`);
  return { light: sets[0], dark: sets[1], contrastHigh: { light: sets[2], dark: sets[3] } };
}

// ---------- the contrast gate (single source: worker/test/miniapp/style-gate.ts) ----------

let gatePromise = null;
/** Loads style-gate.ts (checkTokens, ratio, luminance, NORMAL_PAIRS, HIGH_PAIRS) by bundling it with esbuild. */
export function loadGate() {
  gatePromise ??= (async () => {
    const requireFromWorker = createRequire(join(ROOT, "worker/package.json"));
    const esbuild = requireFromWorker("esbuild");
    const out = await esbuild.build({ entryPoints: [join(ROOT, "worker/test/miniapp/style-gate.ts")], bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent" });
    const url = "data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64");
    return import(url);
  })();
  return gatePromise;
}

// ---------- manual steps ----------

/**
 * The checklist printed after a style was created: file, what to do, the exact line. `tokens` (optional) fills the
 * meta.ts swatch with real colours.
 */
export function manualSteps(id, name, tokens) {
  const ids = registeredIds();
  const next = [...ids, id].map((x) => `"${x}"`).join(", ");
  const l = tokens?.light;
  const d = tokens?.dark;
  const sw = (bg, ac, key) => `sw("${bg}", "${ac}", "${key}")`;
  return [
    ["miniapp/src/contract/model.ts", `STYLE_IDS = [${next}] as const;   (add "${id}" at the end; it appears in the picker in this order)`],
    ["miniapp/src/styles/meta.ts", `STYLE_META: add  ${id}: { id: "${id}", nameKey: "style_${id}", swatch: { light: ${sw(l?.bg ?? "#rrggbb", l?.accent ?? "#rrggbb", l?.surface ?? "#rrggbb")}, dark: ${sw(d?.bg ?? "#rrggbb", d?.accent ?? "#rrggbb", d?.surface ?? "#rrggbb")} } },   (the swatch must equal your tokens)`],
    [`miniapp/src/styles/${id}/index.ts`, `meta: STYLE_META.${id},   (replace the TODO placeholder)`],
    ["miniapp/src/styles/registry.ts", `LOADERS: add  ${id}: () => import("./${id}/index"),   (the style becomes selectable)`],
    ["miniapp/src/catalog-keys.json", `add "style_${id}"   (key of the style name that the Mini App takes from the bot dictionaries)`],
    ["worker/src/i18n/types.ts", `add "style_${id}" to BOTH key lists (next to "style_techno")`],
    ["worker/src/i18n/{ar,en,es,ru,tr,uz-latn,uz-cyrl}.ts", `add  style_${id}: "${name}",  translated, in all 7 dictionaries (next to style_techno)`],
    ["worker/src/templates/calc/style.ts", `STYLE_IDS = [${next}]   (server-side enum: settings API and /style command)`],
    ["site/build.mjs + site/src/texts.mjs", `optional: add "${id}" to STYLES (landing demo swatches) and a style_${id} text`],
    [`miniapp/src/styles/${id}/share.ts`, `optional: share card (drawShareCard in index.ts); copy the idea from styles/tactile/share.ts`],
    ["tests", `cd worker && npx tsc --noEmit && npm run typecheck:app && npx vitest run && npm run build && npm run shots:update (then review the new images)`],
  ];
}

export function printManualSteps(id, name, tokens, log = console.log) {
  log("\nManual steps (registration is deliberately not automatic, DEC-010):");
  manualSteps(id, name, tokens).forEach(([file, what], i) => log(` ${String(i + 1).padStart(2)}. ${file}\n      ${what}`));
}

export { pathToFileURL, copyFileSync };
