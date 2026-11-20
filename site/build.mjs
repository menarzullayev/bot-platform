// Builds the static landing site (7 languages) into worker/public/ (served by the Worker through ASSETS).
//
//   node site/build.mjs            (npm run build:site in worker/)
//
// Output (everything except public/app, which belongs to miniapp/build.mjs and is never touched):
//   index.html, <lang>/index.html        landing (uz-latn at the root)
//   privacy.html, terms.html, support.html and <lang>/<same>   legal pages (text taken from worker/src/i18n at build time)
//   404.html, robots.txt, sitemap.xml, favicon.svg
//   site/site-<hash>.css, site/boot-<hash>.js, site/app-<hash>.js   (cache-busting hashed names)
//   brand/**                              copied from <repo>/brand/out when it exists (OG image etc.)
// The CSP of the site is script-src 'self' / style-src 'self': no inline script/style, no third-party resources.

import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { BOT_URL, CONTACT, CONTACT_URL, FEATURE_ORDER, PRO_STARS, TEXTS } from "./src/texts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const requireFromWorker = createRequire(resolve(root, "worker/package.json"));
const esbuild = requireFromWorker("esbuild");

export const LANGS = ["uz-latn", "uz-cyrl", "ru", "en", "tr", "ar", "es"];
export const LEGAL = ["privacy", "terms", "support"];
const HREFLANG = { "uz-latn": "uz-Latn", "uz-cyrl": "uz-Cyrl", ru: "ru", en: "en", tr: "tr", ar: "ar", es: "es" };
const OG_LOCALE = { "uz-latn": "uz_UZ", "uz-cyrl": "uz_UZ", ru: "ru_RU", en: "en_US", tr: "tr_TR", ar: "ar_AR", es: "es_ES" };
const NATIVE = { "uz-latn": "Oʻzbekcha", "uz-cyrl": "Ўзбекча", ru: "Русский", en: "English", tr: "Türkçe", ar: "العربية", es: "Español" };
const SHORT = { "uz-latn": "UZ", "uz-cyrl": "ЎЗ", ru: "RU", en: "EN", tr: "TR", ar: "AR", es: "ES" };
// decimal and thousands separators shown by the demo calculator
const NUMFMT = { "uz-latn": [",", " "], "uz-cyrl": [",", " "], ru: [",", " "], es: [",", " "], tr: [",", "."], en: [".", ","], ar: [".", ","] };
const STYLES = ["tactile", "glass", "fintech", "techno"];

// ---------------------------------------------------------------- tokens (DEC-009: accent #ab3409 / #ff9254 in every style)
const ACCENT = {
  light: { accent: "#ab3409", onAccent: "#ffffff", accent2: "#b4231f" },
  dark: { accent: "#ff9254", onAccent: "#2a1202", accent2: "#ff6f91" },
};
/** Per style and theme: surface palette (values from design-hub/prototypes/tezcalc-styles, WCAG AA checked by test/site/contrast.test.ts). */
export const TOKENS = {
  tactile: {
    light: { bg: "#e3e7f0", surface: "#e3e7f0", ink: "#1b2231", ink2: "#465067", line: "#b9c1d3", hi: "#ffffff", lo: "#b4bccf", keyHi: "#f2f5fb", keyLo: "#d6dce9" },
    dark: { bg: "#1c2130", surface: "#1c2130", ink: "#e8ecf6", ink2: "#aab3c9", line: "#39415a", hi: "#2a3148", lo: "#10131c", keyHi: "#2c344c", keyLo: "#212839" },
  },
  glass: {
    light: { bg: "#e6e9ff", surface: "#ffffff", ink: "#14142b", ink2: "#44456a", line: "#c9cdf0", hi: "#ffffff", lo: "#8c8fd0", keyHi: "#ffffff", keyLo: "#eef0ff", glass: "rgba(255,255,255,.72)", glassLine: "rgba(255,255,255,.9)", glassShadow: "rgba(70,55,170,.18)", m1: "#ffc4ec", m2: "#aee3ff", m3: "#cdbdff", grid: "transparent" },
    dark: { bg: "#0d0b24", surface: "#17143a", ink: "#f3f2ff", ink2: "#bdbbe6", line: "#3a3770", hi: "#ffffff", lo: "#000000", keyHi: "#ffffff", keyLo: "#ffffff", glass: "rgba(23,20,58,.72)", glassLine: "rgba(255,255,255,.2)", glassShadow: "rgba(0,0,0,.4)", m1: "#7a2bd6", m2: "#0b7fa8", m3: "#c2188a", grid: "transparent" },
  },
  fintech: {
    light: { bg: "#f3f5f8", surface: "#ffffff", ink: "#0f172a", ink2: "#475569", line: "#dde3ec", hi: "#ffffff", lo: "#cbd5e1", keyHi: "#ffffff", keyLo: "#ffffff" },
    dark: { bg: "#0c1017", surface: "#141a24", ink: "#e6ebf3", ink2: "#9aa6b8", line: "#263040", hi: "#141a24", lo: "#000000", keyHi: "#141a24", keyLo: "#141a24" },
  },
  techno: {
    light: { bg: "#eaf3f1", surface: "#ffffff", ink: "#06231e", ink2: "#2f564e", line: "#a9cbc3", hi: "#ffffff", lo: "#a9cbc3", keyHi: "#ffffff", keyLo: "#ffffff", grid: "rgba(0,117,99,.09)" },
    dark: { bg: "#06080c", surface: "#0b0f16", ink: "#d8f7ee", ink2: "#86a39b", line: "#1b3b35", hi: "#0b0f16", lo: "#000000", keyHi: "#0b0f16", keyLo: "#0b0f16", grid: "rgba(34,230,201,.06)" },
  },
};
const SOFT = { light: 8, dark: 18 };

function decls(style, theme) {
  const t = TOKENS[style][theme];
  const a = ACCENT[theme];
  const o = [
    `--bg:${t.bg}`, `--surface:${t.surface}`, `--ink:${t.ink}`, `--ink-2:${t.ink2}`, `--line:${t.line}`,
    `--hi:${t.hi}`, `--lo:${t.lo}`, `--key-hi:${t.keyHi}`, `--key-lo:${t.keyLo}`,
    `--accent:${a.accent}`, `--on-accent:${a.onAccent}`, `--accent-2:${a.accent2}`,
    `--soft:color-mix(in srgb,var(--accent) ${SOFT[theme]}%,${t.bg})`,
  ];
  for (const [k, v] of [["glass", t.glass], ["glass-line", t.glassLine], ["glass-shadow", t.glassShadow], ["m1", t.m1], ["m2", t.m2], ["m3", t.m3], ["grid", t.grid]]) if (v) o.push(`--${k}:${v}`);
  return o.join(";");
}

/** Theme/style token CSS: page = tactile; the other styles only re-skin the demo (`.demo`). */
export function tokensCss() {
  let css = `:root{${decls("tactile", "light")};color-scheme:light}\n`;
  css += `@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${decls("tactile", "dark")};color-scheme:dark}}\n`;
  css += `:root[data-theme=dark]{${decls("tactile", "dark")};color-scheme:dark}\n`;
  for (const s of STYLES.slice(1)) {
    const sel = `[data-style=${s}] .demo`;
    css += `:root${sel}{${decls(s, "light")}}\n`;
    css += `@media (prefers-color-scheme:dark){:root:not([data-theme=light])${sel}{${decls(s, "dark")}}}\n`;
    css += `:root[data-theme=dark]${sel}{${decls(s, "dark")}}\n`;
  }
  return css;
}

// ---------------------------------------------------------------- catalog (worker i18n, bundled from TS at build time)
async function loadCatalog() {
  const out = await esbuild.build({
    entryPoints: [resolve(here, "src/catalog.ts")],
    bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent", target: "es2022",
  });
  const code = out.outputFiles[0].text;
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

// ---------------------------------------------------------------- helpers
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const hash8 = (buf) => BigInt("0x" + createHash("sha256").update(buf).digest("hex").slice(0, 16)).toString(36).toUpperCase().padStart(8, "0").slice(0, 8);
const prefix = (lang) => (lang === "uz-latn" ? "" : "/" + lang);
export const homePath = (lang) => (lang === "uz-latn" ? "/" : `/${lang}/`);
export const legalPath = (lang, page) => `${prefix(lang)}/${page}`;
const legalFile = (lang, page) => `${prefix(lang).slice(1)}${lang === "uz-latn" ? "" : "/"}${page}.html`;
const homeFile = (lang) => (lang === "uz-latn" ? "index.html" : `${lang}/index.html`);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function baseUrlFromWrangler() {
  const toml = readFileSync(resolve(root, "worker/wrangler.toml"), "utf8");
  const m = /^PUBLIC_BASE_URL\s*=\s*"([^"]+)"/m.exec(toml);
  return (process.env.SITE_BASE_URL || (m ? m[1] : "https://example.invalid")).replace(/\/+$/, "");
}

/** Telegram HTML (b, i, u, code, a) -> safe simple HTML. */
export function inlineHtml(src) {
  return src
    .replace(/&(?!#?\w+;)/g, "&amp;")
    .replace(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^>]*)?)>/g, (all, close, tag, attrs) => {
      const t = tag.toLowerCase();
      const map = { b: "strong", strong: "strong", i: "em", em: "em", u: "u", code: "code", pre: "code" };
      if (map[t]) return close ? `</${map[t]}>` : t === "code" || t === "pre" ? `<code dir="ltr">` : `<${map[t]}>`;
      if (t === "a") {
        if (close) return "</a>";
        const h = /href\s*=\s*"([^"]*)"/i.exec(attrs);
        return h && /^(https?:\/\/|tg:\/\/|mailto:)/i.test(h[1]) ? `<a href="${h[1]}" rel="noopener">` : "<a>";
      }
      return "";
    });
}
const plainText = (html) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");

/** Converts one catalog message to {title, html, firstText}. Lines "• " become lists, a lone <b>..</b> line a heading. */
export function telegramToHtml(src, { headingLevel = 2 } = {}) {
  const lines = src.split("\n");
  let title = "";
  const out = [];
  let list = [];
  const flush = () => {
    if (list.length) out.push("<ul>" + list.map((l) => `<li>${inlineHtml(l)}</li>`).join("") + "</ul>");
    list = [];
  };
  let first = true;
  let firstText = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const bullet = /^•\s*(.*)$/.exec(line);
    if (bullet) { list.push(bullet[1]); if (!firstText) firstText = plainText(inlineHtml(bullet[1])); continue; }
    flush();
    const head = /^<b>(.*)<\/b>$/.exec(line);
    if (head && first) { title = plainText(inlineHtml(head[1])); first = false; continue; }
    first = false;
    if (head) out.push(`<h${headingLevel}>${inlineHtml(head[1])}</h${headingLevel}>`);
    else {
      out.push(`<p>${inlineHtml(line)}</p>`);
      if (!firstText) firstText = plainText(inlineHtml(line));
    }
  }
  flush();
  return { title, html: out.join("\n"), firstText };
}

// ---------------------------------------------------------------- page rendering
const LOGO = `<svg class="logo" viewBox="0 0 72 72" aria-hidden="true" focusable="false"><rect class="l-bg" x="4" y="4" width="64" height="64" rx="20"/><rect class="l-bar" x="19" y="25" width="26" height="6" rx="3"/><rect class="l-bar" x="19" y="39" width="26" height="6" rx="3"/><path class="l-bolt" d="M47 14 33 38h9l-4 20 15-26h-9z"/></svg>`;
const THEME_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>`;

// tokens the transliterator would mangle (domain names): swapped for {placeholders}, which it leaves alone
const KEEP = ["cbu.uz"];
function cyrl(catalog, latin) {
  let t = latin;
  KEEP.forEach((k, i) => (t = t.split(k).join(`{keep${i}}`)));
  t = catalog.latinToCyrillic(t);
  KEEP.forEach((k, i) => (t = t.split(`{keep${i}}`).join(k)));
  return t;
}

function ctx(opts) {
  const catalog = opts.catalog;
  const text = (lang, key) => {
    const e = TEXTS[key];
    if (!e) throw new Error("missing text key " + key);
    const raw = (lang === "uz-cyrl" ? cyrl(catalog, e.uz) : e[lang === "uz-latn" ? "uz" : lang]) ?? "";
    if (!raw) throw new Error(`empty text ${key}/${lang}`);
    return raw.replace(/\{stars\}/g, String(PRO_STARS));
  };
  return { ...opts, text };
}

function head(c, lang, { title, desc, path, alternates, noindex = false }) {
  const url = c.base + path;
  const hl = HREFLANG[lang];
  const og = c.ogImage ? `<meta property="og:image" content="${c.base}/brand/og.jpg"><meta name="twitter:image" content="${c.base}/brand/og.jpg"><meta name="twitter:card" content="summary_large_image">` : `<meta name="twitter:card" content="summary">`;
  const alts = alternates
    ? alternates.map(([l, p]) => `<link rel="alternate" hreflang="${HREFLANG[l]}" href="${c.base}${p}">`).join("") +
      `<link rel="alternate" hreflang="x-default" href="${c.base}${alternates[0][1]}">`
    : "";
  return `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="${TOKENS.tactile.light.bg}" media="(prefers-color-scheme: light)"><meta name="theme-color" content="${TOKENS.tactile.dark.bg}" media="(prefers-color-scheme: dark)">
${noindex ? `<meta name="robots" content="noindex">` : `<link rel="canonical" href="${url}">`}${alts}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website"><meta property="og:site_name" content="TezCalc"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:locale" content="${OG_LOCALE[lang] ?? hl}">${og}
<link rel="stylesheet" href="/site/${c.cssName}"><script src="/site/${c.bootName}"></script></head>`;
}

function header(c, lang, current) {
  const T = (k) => c.text(lang, k);
  const home = homePath(lang);
  const isHome = current === "home";
  const nav = isHome
    ? `<nav class="nav" aria-label="${esc(T("nav_label"))}"><a href="#features">${esc(T("nav_features"))}</a><a href="#pricing">${esc(T("nav_pricing"))}</a><a href="#faq">${esc(T("nav_faq"))}</a></nav>`
    : "";
  const items = LANGS.map((l) => {
    const href = isHome ? homePath(l) : legalPath(l, current);
    return `<li><a href="${href}" lang="${HREFLANG[l]}" hreflang="${HREFLANG[l]}"${l === lang ? ` aria-current="true"` : ""}>${esc(NATIVE[l])}</a></li>`;
  }).join("");
  return `<a class="skip" href="#main">${esc(T("skip"))}</a>
<header class="top wrap"><a class="brand" href="${home}">${LOGO}<span>Tez<b>Calc</b></span></a>${nav}
<details class="langs"><summary class="tool" aria-label="${esc(T("lang_label"))}"><span aria-hidden="true">${SHORT[lang]}</span></summary><ul>${items}</ul></details>
<button class="tool" id="theme-btn" type="button" aria-label="${esc(T("theme_toggle"))}" title="${esc(T("theme_toggle"))}">${THEME_ICON}</button></header>`;
}

function footer(c, lang) {
  const T = (k) => c.text(lang, k);
  return `<footer class="foot"><div class="wrap"><nav aria-label="${esc(T("foot_contact"))}"><a href="${legalPath(lang, "privacy")}">${esc(T("foot_privacy"))}</a><a href="${legalPath(lang, "terms")}">${esc(T("foot_terms"))}</a><a href="${legalPath(lang, "support")}">${esc(T("foot_support"))}</a></nav>
<p>${esc(T("foot_contact"))}: <a href="${CONTACT_URL}" rel="noopener">${CONTACT}</a> · © 2026 TezCalc</p></div></footer>`;
}

function demo(c, lang) {
  const T = (k) => c.text(lang, k);
  const [dec, grp] = NUMFMT[lang];
  const k = (key, label, cls = "", aria = "") => `<button class="key${cls ? " " + cls : ""}" type="button" data-k="${key}"${aria ? ` aria-label="${esc(aria)}"` : ""}>${label}</button>`;
  const keys = [
    k("AC", "AC", "fn", T("key_clear")), k("(", "(", "op"), k(")", ")", "op"), k("BS", "&#9003;", "fn", T("key_back")),
    k("7", "7"), k("8", "8"), k("9", "9"), k("/", "&divide;", "op"),
    k("4", "4"), k("5", "5"), k("6", "6"), k("*", "&times;", "op"),
    k("1", "1"), k("2", "2"), k("3", "3"), k("-", "&minus;", "op"),
    k("0", "0"), k(".", esc(dec)), k("%", "%", "op"), k("+", "+", "op"),
  ].join("");
  const eq = `<button class="key eq" type="button" data-k="=" aria-label="${esc(T("key_equals"))}">=</button>`;
  const styleBtns = STYLES.map((s) => `<button class="pill" type="button" data-style-btn="${s}" aria-pressed="${s === "tactile"}">${esc(T("style_" + s))}</button>`).join("");
  const examples = ["0.1+0.2", "1200+15%", "200-10%", "(3+4)*5"].map((e) => `<button class="pill" type="button" data-expr="${e}">${e}</button>`).join("");
  return `<div class="demo-box" id="demo" data-dec="${dec}" data-grp="${grp}" data-err="${esc(T("demo_err"))}">
<div class="demo" role="group" aria-label="${esc(T("demo_calc"))}"><div class="demo-label"><span>${esc(T("demo_label"))}</span><span>TezCalc</span></div>
<div class="d-display"><div class="d-expr" id="d-expr" aria-label="${esc(T("demo_expr"))}"></div><output class="d-res" id="d-res" for="d-expr" aria-label="${esc(T("demo_result"))}"></output></div>
<div class="d-keys">${keys}</div><div class="d-keys wide">${eq}</div></div>
<div class="demo-opts" role="group" aria-label="${esc(T("demo_style"))}"><span class="lbl">${esc(T("demo_style"))}:</span>${styleBtns}</div>
<div class="chips" role="group" aria-label="${esc(T("demo_examples"))}">${examples}</div>
<p class="float">${esc(T("demo_float"))}</p></div>`;
}

function landing(c, lang) {
  const T = (k) => c.text(lang, k);
  const cards = FEATURE_ORDER.map((id, i) => `<div class="card${i < 4 ? " hl" : ""}"><h3>${esc(T(`f_${id}_t`))}</h3><p>${esc(T(`f_${id}_d`))}</p></div>`).join("");
  const free = [1, 2, 3, 4].map((i) => `<li>${esc(T("free_" + i))}</li>`).join("");
  const pro = [1, 2, 3, 4].map((i) => `<li>${esc(T("pro_" + i))}</li>`).join("");
  const faq = [1, 2, 3, 4, 5, 6].map((i) => `<details class="q"><summary>${esc(T("q" + i))}</summary><p>${esc(T("a" + i))}</p></details>`).join("");
  const trust = [1, 2, 3].map((i) => `<li>${esc(T("trust_" + i))}</li>`).join("");
  const path = homePath(lang);
  const html = `<!doctype html>
<html lang="${HREFLANG[lang]}" dir="${lang === "ar" ? "rtl" : "ltr"}">
${head(c, lang, { title: T("meta_title"), desc: T("meta_desc"), path, alternates: LANGS.map((l) => [l, homePath(l)]) })}
<body>
${header(c, lang, "home")}
<main id="main">
<div class="wrap hero"><div><span class="eyebrow">${esc(T("hero_eyebrow"))}</span><h1>${esc(T("hero_title"))}</h1><p class="sub">${esc(T("hero_sub"))}</p>
<div class="cta"><a class="btn primary" href="${BOT_URL}" rel="noopener">${esc(T("cta_open"))}</a><a class="btn" href="#demo">${esc(T("cta_demo"))}</a></div><p class="note">${esc(T("hero_note"))}</p></div>
${demo(c, lang)}</div>
<section id="features" class="wrap"><h2 class="sec-title">${esc(T("feat_title"))}</h2><div class="grid">${cards}</div></section>
<section id="pricing" class="wrap"><h2 class="sec-title">${esc(T("price_title"))}</h2><div class="price">
<div class="card"><h3>${esc(T("price_free"))}</h3><p class="amount">0</p><ul>${free}</ul></div>
<div class="card hl"><h3>${esc(T("price_pro"))}</h3><p class="amount">${esc(T("pro_amount"))}</p><ul>${pro}</ul></div></div>
<p class="price-note">${esc(T("price_note"))}</p></section>
<section id="faq" class="wrap"><h2 class="sec-title">${esc(T("faq_title"))}</h2><div class="faq">${faq}</div></section>
<section class="wrap trust"><div class="card"><h2 class="sec-title">${esc(T("trust_title"))}</h2><ul>${trust}</ul><a href="${legalPath(lang, "privacy")}">${esc(T("trust_link"))}</a></div></section>
<section class="wrap final"><h2 class="sec-title">${esc(T("final_title"))}</h2><div class="cta"><a class="btn primary" href="${BOT_URL}" rel="noopener">${esc(T("cta_open"))}</a></div></section>
</main>
${footer(c, lang)}
<script src="/site/${c.appName}" defer></script>
</body></html>
`;
  return html;
}

function legal(c, lang, page) {
  const T = (k) => c.text(lang, k);
  const dict = c.catalog.DICTIONARIES[lang];
  const key = page === "support" ? "paysupport" : page;
  const main = telegramToHtml(dict[key], { headingLevel: 2 });
  let body = main.html;
  if (page === "support") {
    const cancel = telegramToHtml(dict.pro_cancel_info);
    body += `\n<h2>${esc(T("support_cancel"))}</h2>\n${cancel.html}\n<p class="box">${esc(T("support_contact"))} <a href="${CONTACT_URL}" rel="noopener">${CONTACT}</a></p>`;
  }
  const title = `${main.title.replace(/^[^\p{L}\p{N}]+/u, "")} · TezCalc`;
  const desc = (main.firstText || main.title).slice(0, 160);
  const path = legalPath(lang, page);
  return `<!doctype html>
<html lang="${HREFLANG[lang]}" dir="${lang === "ar" ? "rtl" : "ltr"}">
${head(c, lang, { title, desc, path, alternates: LANGS.map((l) => [l, legalPath(l, page)]) })}
<body>
${header(c, lang, page)}
<main id="main" class="wrap"><article class="prose"><a class="back" href="${homePath(lang)}">${esc(T("legal_home"))}</a>
<h1>${esc(main.title)}</h1>
${body}
</article></main>
${footer(c, lang)}
<script src="/site/${c.appName}" defer></script>
</body></html>
`;
}

function notFound(c) {
  const T = (k, l) => c.text(l, k);
  return `<!doctype html>
<html lang="uz-Latn" dir="ltr">
${head(c, "uz-latn", { title: `404 · TezCalc`, desc: T("nf_text", "uz-latn"), path: "/404.html", noindex: true })}
<body>
<header class="top wrap"><a class="brand" href="/">${LOGO}<span>Tez<b>Calc</b></span></a></header>
<main id="main" class="wrap"><article class="prose"><h1>404</h1><p>${esc(T("nf_title", "uz-latn"))}. ${esc(T("nf_text", "uz-latn"))}</p><p lang="en">${esc(T("nf_title", "en"))}. ${esc(T("nf_text", "en"))}</p><p><a class="btn primary" href="/">${esc(T("legal_home", "uz-latn"))} / ${esc(T("legal_home", "en"))}</a></p></article></main>
<script src="/site/${c.appName}" defer></script>
</body></html>
`;
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><rect x="4" y="4" width="64" height="64" rx="18" fill="#ab3409"/><rect x="19" y="25" width="26" height="6" rx="3" fill="#fff"/><rect x="19" y="39" width="26" height="6" rx="3" fill="#fff"/><path d="M47 14 33 38h9l-4 20 15-26h-9z" fill="#fff"/></svg>
`;

function sitemap(base) {
  const alt = (page) => LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${HREFLANG[l]}" href="${base}${page ? legalPath(l, page) : homePath(l)}"/>`).join("") + `<xhtml:link rel="alternate" hreflang="x-default" href="${base}${page ? legalPath("uz-latn", page) : "/"}"/>`;
  const urls = [];
  for (const page of [null, ...LEGAL]) for (const l of LANGS) urls.push(`<url><loc>${base}${page ? legalPath(l, page) : homePath(l)}</loc>${alt(page)}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
}

/** Native-speaker review sheet: every landing text, key -> 7 languages. */
function reviewMarkdown(catalog) {
  const c = ctx({ catalog });
  let md = "# TezCalc landing texts: review sheet\n\nGenerated by `site/build.mjs` from `site/src/texts.mjs` (do not edit this file by hand). `uz-cyrl` is produced automatically from `uz-latn` by `worker/src/i18n/translit.ts`.\nLegal pages (/privacy, /terms, /support) are not listed: they come from the bot catalog in `worker/src/i18n`.\n\n";
  for (const key of Object.keys(TEXTS)) {
    md += `## ${key}\n\n`;
    for (const l of LANGS) md += `- **${l}**: ${c.text(l, key)}\n`;
    md += "\n";
  }
  return md;
}

/**
 * @param {{ outDir?: string, minify?: boolean, base?: string, writeReview?: boolean }} [opts]
 */
export async function buildSite(opts = {}) {
  const outDir = resolve(opts.outDir ?? resolve(root, "worker/public"));
  const minify = opts.minify ?? true;
  const base = (opts.base ?? baseUrlFromWrangler()).replace(/\/+$/, "");
  mkdirSync(outDir, { recursive: true });
  // clean everything this build owns; public/app belongs to the Mini App build
  for (const name of readdirSync(outDir)) if (name !== "app") rmSync(join(outDir, name), { recursive: true, force: true });
  const siteDir = join(outDir, "site");
  mkdirSync(siteDir, { recursive: true });

  const catalog = await loadCatalog();

  // assets
  const cssSrc = tokensCss() + readFileSync(resolve(here, "src/site.css"), "utf8");
  const css = (await esbuild.transform(cssSrc, { loader: "css", minify })).code;
  const js = async (file) => (await esbuild.transform(readFileSync(resolve(here, "src", file), "utf8"), { loader: "js", minify, target: "es2020", legalComments: "none", charset: "utf8" })).code;
  const bootCode = await js("boot.js");
  const appCode = await js("app.js");
  const cssName = `site-${hash8(css)}.css`;
  const bootName = `boot-${hash8(bootCode)}.js`;
  const appName = `app-${hash8(appCode)}.js`;
  writeFileSync(join(siteDir, cssName), css);
  writeFileSync(join(siteDir, bootName), bootCode);
  writeFileSync(join(siteDir, appName), appCode);

  // brand assets from the brand agent (optional)
  const brandSrc = resolve(root, "brand/out");
  let ogImage = false;
  if (existsSync(brandSrc) && statSync(brandSrc).isDirectory()) {
    for (const f of walk(brandSrc)) {
      const rel = relative(brandSrc, f);
      const dest = join(outDir, "brand", rel);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(f, dest);
    }
    ogImage = existsSync(join(outDir, "brand", "og.jpg"));
  }

  const c = ctx({ catalog, base, cssName, bootName, appName, ogImage });
  const put = (rel, content) => {
    const p = join(outDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  };
  for (const lang of LANGS) {
    put(homeFile(lang), landing(c, lang));
    for (const page of LEGAL) put(legalFile(lang, page), legal(c, lang, page));
  }
  put("404.html", notFound(c));
  put("favicon.svg", FAVICON);
  put("robots.txt", `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /api/\nDisallow: /admin/\n\nSitemap: ${base}/sitemap.xml\n`);
  put("sitemap.xml", sitemap(base));
  if (opts.writeReview ?? true) writeFileSync(resolve(here, "TEXTS-REVIEW.md"), reviewMarkdown(catalog));

  const files = walk(outDir)
    .map((p) => relative(outDir, p).replace(/\\/g, "/"))
    .filter((n) => !n.startsWith("app/"))
    .map((name) => {
      const buf = readFileSync(join(outDir, name));
      return { name, bytes: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
    });
  const total = files.reduce((a, f) => ({ raw: a.raw + f.bytes, gzip: a.gzip + f.gzip }), { raw: 0, gzip: 0 });
  return { outDir, base, files, total, cssName, bootName, appName, ogImage };
}

// CLI
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildSite()
    .then((r) => {
      const shared = r.files.filter((f) => f.name.startsWith("site/") || f.name === "favicon.svg");
      const html = r.files.filter((f) => f.name.endsWith(".html"));
      console.log(`site: ${html.length} pages, ${shared.length} shared files, base ${r.base}${r.ogImage ? ", og image present" : ", no og image"}`);
      for (const f of shared) console.log(`  ${f.name.padEnd(28)} ${String(f.bytes).padStart(7)} B  gzip ${String(f.gzip).padStart(6)} B`);
      console.log(`  total (all languages) ${r.total.raw} B raw, ${r.total.gzip} B gzip -> ${relative(process.cwd(), r.outDir) || "."}`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
