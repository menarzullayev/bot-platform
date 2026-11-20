// Brand asset generator: SVG sources (brand/src) -> JPEG/SVG in brand/out.
// Deterministic: no system fonts (text is pre-converted to <path> in src/glyphs.json), pure-JS JPEG encoder.
// Usage: node brand/build.mjs   (or `npm run brand` in worker/)
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
// The tools live in worker/node_modules (single install for the repo).
const require = createRequire(join(here, "..", "worker", "package.json"));
const { Resvg } = require("@resvg/resvg-js");
const jpeg = require("jpeg-js");

const SRC = join(here, "src");
const OUT = join(here, "out");
mkdirSync(OUT, { recursive: true });

const tokens = JSON.parse(readFileSync(join(SRC, "tokens.json"), "utf8"));
const glyphs = JSON.parse(readFileSync(join(SRC, "glyphs.json"), "utf8"));
const QUALITY = 90;

/** 5-point star path centred on the origin with outer radius R. */
function starPath(R) {
  const r = R * 0.4;
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : r;
    pts.push(`${(Math.cos(a) * rad).toFixed(2)} ${(Math.sin(a) * rad).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

/** Replace {{token}}, {{glyph:name}} and {{star:R}} placeholders; unknown ones are a build error. */
function expand(svg, file) {
  return svg.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    if (key.startsWith("glyph:")) {
      const g = glyphs[key.slice(6)];
      if (!g) throw new Error(`${file}: unknown glyph ${key}`);
      return g.d;
    }
    if (key.startsWith("star:")) return starPath(Number(key.slice(5)));
    if (!(key in tokens)) throw new Error(`${file}: unknown token ${key}`);
    return tokens[key];
  });
}

const budgets = {
  "avatar": 60_000,
  "description": 80_000,
  "stars-pro": 80_000,
  "thumb-calc": 10_000,
  "thumb-convert": 10_000,
  "thumb-loan": 10_000,
  "thumb-error": 10_000,
  "og": 80_000,
};

const report = [];
for (const f of readdirSync(SRC).filter((n) => n.endsWith(".svg")).sort()) {
  const name = f.replace(/\.svg$/, "");
  const svg = expand(readFileSync(join(SRC, f), "utf8"), f);
  if (name === "mark" || name === "favicon") {
    writeFileSync(join(OUT, f), svg);
    report.push(`${f} ${svg.length} B`);
    continue;
  }
  const r = new Resvg(svg, { font: { loadSystemFonts: false }, shapeRendering: 2, textRendering: 1 }).render();
  const { width, height } = r;
  const rgba = Buffer.from(r.pixels);
  const bytes = jpeg.encode({ data: rgba, width, height }, QUALITY).data;
  if (bytes.length > budgets[name]) throw new Error(`${name}.jpg is ${bytes.length} B, budget ${budgets[name]} B`);
  writeFileSync(join(OUT, `${name}.jpg`), bytes);
  report.push(`${name}.jpg ${width}x${height} ${bytes.length} B`);
  if (name === "avatar") {
    // Helper (git-ignored): how Telegram's round crop looks, on a neutral backdrop.
    const b64 = Buffer.from(bytes).toString("base64");
    const prev = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 640 640" width="640" height="640"><rect width="640" height="640" fill="#808080"/><clipPath id="c"><circle cx="320" cy="320" r="320"/></clipPath><image clip-path="url(#c)" width="640" height="640" xlink:href="data:image/jpeg;base64,${b64}"/></svg>`;
    writeFileSync(join(OUT, "avatar-preview-round.png"), new Resvg(prev).render().asPng());
  }
}
console.log(report.join("\n"));
