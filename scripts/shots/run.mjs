// Screenshot regression for the Mini App styles (DEC-017).
//
//   npm run shots          compare with miniapp/shots/baseline/<platform>/ (exit 1 on a diff or a layout violation)
//   npm run shots:update   re-take the baseline (also after an intentional visual change)
//
// What it does: builds the Mini App into a temp dir, serves it from a tiny static server (demo mode: no bot id in the
// URL, so there is no API at all and nothing needs mocking), and drives headless chromium through
// styles x themes x viewports x pages. Every shot is deterministic: reduced motion + animations/transitions off,
// fixed Date, fixed Math.random, fixed language, network blocked (the Telegram SDK script is aborted), system fonts.
// Besides the pixel compare it runs layout checks on the page that is on screen (no sideways scroll, nothing taller than
// the window, nothing clipped), which hold on every platform.
//
// Baselines are per platform (system fonts differ between Windows/macOS/Linux): miniapp/shots/baseline/<platform>/.
// Options: --update, --styles a,b, --themes light,dark, --viewports 264x470,..., --pages calc,..., --threshold 0.001,
//          --keep-build, --headed.
// Env: SHOTS_ALLOW_MISSING=1  a missing baseline for this platform is a warning, not a failure (CI bootstrap).

import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const requireFromWorker = createRequire(resolve(root, "worker/package.json"));

function need(name) {
  try {
    return requireFromWorker(name);
  } catch {
    console.error(`missing dev dependency "${name}": run "npm install" in worker/ (playwright-core, pixelmatch, pngjs).`);
    process.exit(2);
  }
}
const { chromium } = need("playwright-core");
const { PNG } = need("pngjs");
const pixelmatch = (await import(pathToFileURL(requireFromWorker.resolve("pixelmatch")).href)).default;

// ---------- matrix ----------

const ALL_THEMES = ["light", "dark"];
/** Telegram's smallest window is the tightest case (DEC-017). */
const ALL_VIEWPORTS = [
  [264, 470],
  [360, 640],
  [412, 915],
];
const ALL_PAGES = ["calc", "convert", "graph", "solve", "finance", "settings"]; // tab order of main.ts
const FIXED_TIME = new Date("2026-01-15T12:00:00Z");
const DEFAULT_THRESHOLD = 0.001; // 0.1 % of the pixels
const BASELINE_BUDGET = 8 * 1024 * 1024;

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

function styleIds() {
  const src = readFileSync(resolve(root, "miniapp/src/contract/model.ts"), "utf8");
  const m = /STYLE_IDS\s*=\s*\[([^\]]*)\]/.exec(src);
  if (!m) throw new Error("cannot read STYLE_IDS from miniapp/src/contract/model.ts");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

const update = flag("update");
const styles = (opt("styles")?.split(",") ?? styleIds()).filter(Boolean);
const themes = opt("themes")?.split(",") ?? ALL_THEMES;
const viewports = opt("viewports")?.split(",").map((v) => v.split("x").map(Number)) ?? ALL_VIEWPORTS;
const pages = opt("pages")?.split(",") ?? ALL_PAGES;
const threshold = Number(opt("threshold") ?? DEFAULT_THRESHOLD);
const platform = process.platform; // win32 | linux | darwin

const shotsDir = resolve(root, "miniapp/shots");
const baselineDir = join(shotsDir, "baseline", platform);
const actualDir = join(shotsDir, "actual", platform);
const diffDir = join(shotsDir, "diff");

// ---------- PNG helpers ----------

/** Re-encodes losslessly and small: no alpha channel, max deflate (the baseline lives in git, budget 8 MB). */
function encodePng(png) {
  return PNG.sync.write(png, { colorType: 2, inputColorType: 6, inputHasAlpha: true, deflateLevel: 9, filterType: -1 });
}

// ---------- static server ----------

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

function serve(dir) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/" || rel === "/app" || rel === "/app/") rel = "/app/index.html";
    const file = resolve(dir, "." + rel.replace(/^\/app/, ""));
    if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

// ---------- in-page checks ----------

/** Runs in the page. Reports layout problems of the page on screen; nothing here depends on fonts of the platform. */
function inspectLayout() {
  const de = document.documentElement;
  const out = { fatal: [], warn: [] };
  const tol = 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (de.scrollWidth > de.clientWidth + tol) out.fatal.push(`document scrolls sideways (scrollWidth ${de.scrollWidth} > clientWidth ${de.clientWidth})`);
  if (document.body.scrollWidth > vw + tol) out.fatal.push(`body wider than the window (${document.body.scrollWidth} > ${vw})`);
  if (de.scrollHeight > vh + tol) out.fatal.push(`document taller than the window (scrollHeight ${de.scrollHeight} > ${vh})`);
  const active = document.querySelector("main.pages > :not([hidden])");
  if (!active) {
    out.fatal.push("no visible page");
    return out;
  }
  if (active.scrollWidth > active.clientWidth + tol) out.fatal.push(`page scrolls sideways (scrollWidth ${active.scrollWidth} > clientWidth ${active.clientWidth})`);
  if (active.scrollHeight > active.clientHeight + tol) out.fatal.push(`page scrolls vertically (scrollHeight ${active.scrollHeight} > clientHeight ${active.clientHeight})`);

  const describe = (el) => {
    const ui = el.getAttribute("data-ui");
    const part = el.getAttribute("data-part");
    return (el.tagName.toLowerCase() + (ui ? `[ui=${ui}]` : "") + (part ? `[part=${part}]` : "") + (el.id ? `#${el.id}` : "") + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : "")).slice(0, 80);
  };
  // clipped content: an element that sticks out of an ancestor which hides the overflow (overflow hidden/clip), or out of the window
  const seen = new Set();
  const scope = [active, document.querySelector(".slot-nav"), document.querySelector(".slot-banner")].filter(Boolean);
  for (const s of scope) {
    for (const el of [s, ...s.querySelectorAll("*")]) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || el.closest("[hidden]")) continue;
      if (el.closest('[aria-hidden="true"]') && !el.closest('[data-ui="display"]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (cs.position === "fixed") continue;
      let msg = "";
      if (r.right > vw + 1 || r.left < -1) msg = `outside the window horizontally (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`;
      else if (r.bottom > vh + 1 && !el.closest("[data-scroll],[data-part=body]")) {
        // below the fold is only a problem when nothing scrolls it into view
        let scrollable = false;
        for (let a = el.parentElement; a; a = a.parentElement) {
          const o = getComputedStyle(a).overflowY;
          if ((o === "auto" || o === "scroll") && a.scrollHeight > a.clientHeight) scrollable = true;
        }
        if (!scrollable) msg = `below the window (bottom ${Math.round(r.bottom)} of ${vh})`;
      }
      if (!msg) {
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const acs = getComputedStyle(a);
          const clips = (v) => v === "hidden" || v === "clip";
          if (!clips(acs.overflowX) && !clips(acs.overflowY)) continue;
          const ar = a.getBoundingClientRect();
          const cx = clips(acs.overflowX) && (r.right > ar.right + 1.5 || r.left < ar.left - 1.5);
          const cy = clips(acs.overflowY) && (r.bottom > ar.bottom + 1.5 || r.top < ar.top - 1.5);
          // text that is merely truncated with an ellipsis is intentional
          if ((cx || cy) && !(cs.textOverflow === "ellipsis" && cx)) {
            msg = `clipped by ${describe(a)} (${cx ? "x" : "y"})`;
            break;
          }
        }
      }
      if (!msg && el.children.length === 0 && /^\S{4,}$/.test((el.textContent ?? "").trim())) {
        // a single word that wrapped onto several lines was broken in the middle ("Degree/s")
        const range = document.createRange();
        range.selectNodeContents(el);
        const tops = new Set([...range.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top / 3)));
        if (tops.size > 1) msg = `single word "${(el.textContent ?? "").trim()}" is broken over ${tops.size} lines`;
      }
      if (msg) {
        const key = describe(el) + msg;
        if (!seen.has(key)) {
          seen.add(key);
          out.warn.push(`${describe(el)}: ${msg}`);
        }
      }
    }
  }
  out.warn = out.warn.slice(0, 8);
  return out;
}

// ---------- main ----------

const started = Date.now();
const failures = []; // { id, why }
const warnings = []; // { id, text }
const layoutKnown = new Set(); // ids with a layout violation (filled below)
let compared = 0;
let missing = 0;
let written = 0;

function logProgress(msg) {
  if (process.stdout.isTTY) process.stdout.write(`\r${msg.padEnd(78)}`);
}

async function main() {
  console.log(`shots: ${update ? "UPDATE" : "compare"} on ${platform}; ${styles.length} styles x ${themes.length} themes x ${viewports.length} viewports x ${pages.length} pages`);
  const tmp = mkdtempSync(join(tmpdir(), "tezcalc-shots-"));
  const outDir = join(tmp, "app");
  const { buildApp } = await import(pathToFileURL(resolve(root, "miniapp/build.mjs")).href);
  await buildApp({ outDir, minify: true });
  const server = await serve(outDir);
  const base = `http://127.0.0.1:${server.address().port}`;

  rmSync(actualDir, { recursive: true, force: true });
  rmSync(diffDir, { recursive: true, force: true });
  mkdirSync(actualDir, { recursive: true });
  if (update) {
    rmSync(baselineDir, { recursive: true, force: true });
    mkdirSync(baselineDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: !flag("headed"), args: ["--font-render-hinting=none", "--disable-lcd-text", "--force-color-profile=srgb"] });
  try {
    for (const style of styles) {
      for (const theme of themes) {
        for (const [w, h] of viewports) {
          await runCombination(browser, base, style, theme, w, h);
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
    if (!flag("keep-build")) rmSync(tmp, { recursive: true, force: true });
  }
  process.stdout.write("\r".padEnd(80) + "\r");
}

async function runCombination(browser, base, style, theme, w, h) {
  const context = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    colorScheme: theme,
    locale: "en-US",
    timezoneId: "UTC",
  });
  // the app needs nothing but its own origin; the Telegram SDK script must not load (no network, no randomness)
  await context.route("**/*", (route) => (route.request().url().startsWith(base) ? route.continue() : route.abort()));
  await context.addInitScript(
    ([prefs]) => {
      try {
        window.localStorage.setItem("tc:prefs", JSON.stringify(prefs));
      } catch {
        /* ignore */
      }
      Math.random = () => 0.5;
    },
    [{ lang: "en", theme, style }],
  );
  const page = await context.newPage();
  await page.clock.setFixedTime(FIXED_TIME);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message ?? e)));
  page.on("console", (m) => {
    // the aborted Telegram SDK request is expected
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });

  const tag = `${style}-${theme}-${w}x${h}`;
  try {
    await page.goto(`${base}/app/index.html`, { waitUntil: "load" });
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}" });
    await page.waitForFunction(
      (id) => document.documentElement.getAttribute("data-style") === id && !!document.querySelector('#style-pack') && !!document.querySelector('[data-ui="tabs"] [role="tab"]'),
      style,
      { timeout: 15000 },
    );
    await page.evaluate(() => document.fonts.ready);
    const tabs = page.locator('[data-ui="tabs"] [role="tab"]');
    if ((await tabs.count()) !== ALL_PAGES.length) throw new Error(`expected ${ALL_PAGES.length} tabs, found ${await tabs.count()}`);

    for (const name of pages) {
      const idx = ALL_PAGES.indexOf(name);
      const id = `${tag}-${name}`;
      logProgress(id);
      await tabs.nth(idx).click();
      await page.waitForFunction(
        (n) => {
          const tab = document.querySelectorAll('[data-ui="tabs"] [role="tab"]')[n];
          const el = document.querySelector("main.pages > :not([hidden])");
          return !!tab && tab.getAttribute("aria-selected") === "true" && !!el && el.children.length > 0;
        },
        idx,
        { timeout: 15000 },
      );
      await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
      await page.waitForTimeout(120);
      const layout = await page.evaluate(inspectLayout);
      for (const f of layout.fatal) failures.push({ id, why: `layout: ${f}` });
      for (const x of layout.warn) warnings.push({ id, text: `layout: ${x}` });
      if (layout.fatal.length) layoutKnown.add(id);
      const raw = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
      await handleShot(id, raw);
    }
    for (const e of errors) warnings.push({ id: tag, text: `console/page error: ${e}` });
  } catch (e) {
    failures.push({ id: tag, why: `run error: ${String(e.message ?? e).split("\n")[0]}` });
  } finally {
    await context.close();
  }
}

async function handleShot(id, raw) {
  const actual = PNG.sync.read(raw);
  const encoded = encodePng(actual);
  writeFileSync(join(actualDir, `${id}.png`), encoded);
  if (update) {
    writeFileSync(join(baselineDir, `${id}.png`), encoded);
    written++;
    return;
  }
  const basePath = join(baselineDir, `${id}.png`);
  if (!existsSync(basePath)) {
    missing++;
    return;
  }
  compared++;
  const base = PNG.sync.read(readFileSync(basePath));
  if (base.width !== actual.width || base.height !== actual.height) {
    failures.push({ id, why: `size changed ${base.width}x${base.height} -> ${actual.width}x${actual.height}` });
    return;
  }
  const diff = new PNG({ width: base.width, height: base.height });
  const n = pixelmatch(base.data, actual.data, diff.data, base.width, base.height, { threshold: 0.1, includeAA: false });
  const frac = n / (base.width * base.height);
  if (frac > threshold) {
    mkdirSync(diffDir, { recursive: true });
    writeFileSync(join(diffDir, `${id}.diff.png`), PNG.sync.write(diff));
    failures.push({ id, why: `pixel diff ${(frac * 100).toFixed(3)} % (${n} px) > ${(threshold * 100).toFixed(2)} %` });
  }
}

function dirBytes(dir) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).reduce((a, f) => a + statSync(join(dir, f)).size, 0);
}

await main();

const secs = ((Date.now() - started) / 1000).toFixed(1);
const total = styles.length * themes.length * viewports.length * pages.length;
const known = loadKnown();
const hard = failures.filter((f) => !known.has(`${f.id}|${f.why.replace(/\d+/g, "#")}`));
const accepted = failures.filter((f) => known.has(`${f.id}|${f.why.replace(/\d+/g, "#")}`));

function loadKnown() {
  const file = join(here, "known-issues.json");
  if (!existsSync(file)) return new Set();
  try {
    return new Set(JSON.parse(readFileSync(file, "utf8")).map((e) => `${e.id}|${String(e.why).replace(/\d+/g, "#")}`));
  } catch {
    return new Set();
  }
}

if (warnings.length) {
  console.log(`\n${warnings.length} layout/console warning(s) (not fatal):`);
  for (const w of warnings.slice(0, 60)) console.log(`  warn ${w.id}: ${w.text}`);
  if (warnings.length > 60) console.log(`  ... and ${warnings.length - 60} more (actual shots: ${actualDir})`);
}
if (accepted.length) {
  console.log(`\n${accepted.length} known issue(s) (scripts/shots/known-issues.json):`);
  for (const f of accepted) console.log(`  known ${f.id}: ${f.why}`);
}

if (update) {
  const bytes = dirBytes(baselineDir);
  console.log(`\nbaseline written: ${written} images, ${(bytes / 1024 / 1024).toFixed(2)} MB -> ${baselineDir} (${secs} s)`);
  if (bytes > BASELINE_BUDGET) {
    console.error(`baseline is over the ${BASELINE_BUDGET / 1024 / 1024} MB budget: shrink the matrix or the viewports`);
    process.exit(1);
  }
  for (const f of hard) console.error(`FAIL ${f.id}: ${f.why}`);
  process.exit(hard.length ? 1 : 0);
}

console.log(`\ncompared ${compared}/${total} shots against ${baselineDir} in ${secs} s`);
let code = 0;
if (missing) {
  const msg = `${missing} baseline image(s) missing for ${platform}: run "npm run shots:update" (in worker/) and commit miniapp/shots/baseline/${platform}/`;
  if (process.env.SHOTS_ALLOW_MISSING === "1") console.log(`WARN ${msg}\n     (SHOTS_ALLOW_MISSING=1: not a failure; the new images are in ${actualDir})`);
  else {
    console.error(`FAIL ${msg}`);
    code = 1;
  }
}
for (const f of hard) {
  console.error(`FAIL ${f.id}: ${f.why}`);
  code = 1;
}
if (hard.some((f) => f.why.startsWith("pixel diff") || f.why.startsWith("size"))) console.error(`diff images: ${diffDir}`);
console.log(code === 0 ? "shots: OK" : "shots: FAILED");
process.exit(code);
