import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuildResult } from "../../../miniapp/build.mjs";
import { en } from "../../src/i18n/en";

// Budget from the task: <= 250 KB gzip for the whole app.
const MAX_GZIP = 250 * 1024;

let dir: string;
let result: BuildResult;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "miniapp-build-"));
  result = await buildApp({ outDir: join(dir, "app") });
}, 60_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const read = (name: string): string => readFileSync(join(result.outDir, name), "utf8");
const jsFiles = (): string[] => result.files.map((f) => f.name).filter((n) => n.endsWith(".js"));

describe("Mini App production bundle", () => {
  it("fits the size budget (gzip) and reports sizes", () => {
    expect(result.total.gzip).toBeLessThan(MAX_GZIP);
    // sanity: it is a real app, not an empty bundle
    expect(result.total.raw).toBeGreaterThan(100_000);
  });

  it("uses cache-busting hashed names and ships no source maps", () => {
    const names = result.files.map((f) => f.name);
    for (const n of names.filter((x) => x !== "index.html")) expect(n, n).toMatch(/^(main|chunk|boot|pack)-[A-Z0-9]{8}\.(js|css)$/);
    expect(names.some((n) => n.endsWith(".map"))).toBe(false);
    for (const f of jsFiles()) expect(read(f)).not.toMatch(/sourceMappingURL/);
  });

  it("generates an index.html with external scripts only (CSP-compatible)", () => {
    const html = read("index.html");
    expect(html).toContain(`<script type="module" src="/app/${result.entryJs}"></script>`);
    expect(html).toContain(`<link rel="stylesheet" href="/app/${result.entryCss}">`);
    expect(html).toContain('<script src="https://telegram.org/js/telegram-web-app.js"></script>');
    // every <script> has a src; no inline handlers, no inline styles
    for (const m of html.matchAll(/<script\b([^>]*)>/g)) expect(m[1]).toMatch(/\bsrc="/);
    // the boot script (cached theme/style/axes before first paint) is an external classic script, before the Telegram SDK
    expect(html).toContain(`<script src="/app/${result.bootJs}"></script>`);
    expect(html.indexOf(result.bootJs)).toBeLessThan(html.indexOf("telegram-web-app.js"));
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toMatch(/\sstyle\s*=/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toContain("<!--CSS-->");
    expect(html).not.toContain("<!--JS-->");
    expect(html).toContain("viewport-fit=cover");
    // the Telegram SDK must load before the app module
    expect(html.indexOf("telegram-web-app.js")).toBeLessThan(html.indexOf(result.entryJs));
  });

  it("has no eval, no Function constructor and no foreign hosts in the code", () => {
    for (const f of jsFiles()) {
      const code = read(f);
      // (`eval` as a method name of the evaluator class is fine; only global/indirect eval and Function() matter to CSP)
      expect(code, f).not.toMatch(/(?:window|globalThis|self)\.eval\b|\(0,\s*eval\)/);
      expect(code, f).not.toMatch(/\bnew Function\s*\(|[=(,;!&|?:]\s*Function\s*\(/);
      // t.me: the share fallback https://t.me/share/url (lib/share.ts); no other host may appear
      const hosts = new Set([...code.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase()));
      for (const h of hosts) expect(["www.w3.org", "t.me"], `${f} references ${h}`).toContain(h);
    }
    expect(read(result.entryCss)).not.toMatch(/https?:\/\//);
  });

  it("loads graph and solve lazily (code split)", () => {
    const main = read(result.entryJs);
    expect(jsFiles().length).toBeGreaterThanOrEqual(3);
    expect(main).toMatch(/import\(["']\.\/chunk-[A-Z0-9]{8}\.js["']\)/);
    // the symbolic step labels are only in a lazy chunk
    const stepLabelFile = jsFiles().filter((f) => read(f).includes("discriminant") && read(f).includes("Cramer"));
    expect(stepLabelFile.length).toBeGreaterThan(0);
    expect(stepLabelFile).not.toContain(result.entryJs);
  });

  it("keeps only the whitelisted catalog keys in the bundled dictionaries", () => {
    const all = jsFiles().map(read).join("\n");
    expect(all).toContain("loan_label_monthly");
    expect(all).toContain("pro_features");
    expect(en.pro_title).toContain("TezCalc");
    expect(all).toContain("TezCalc");
    for (const dropped of ["deleteme_confirm", "bot_short_description", "guest_hint", "converter_help", "inline_help_title"]) {
      expect(all, dropped).not.toContain(dropped);
    }
  });

  it("is deterministic in structure: entry names are referenced by index.html", () => {
    const refs = [...read("index.html").matchAll(/\/app\/((?:main|chunk|boot)-[A-Z0-9]{8}\.(?:js|css))/g)].map((m) => m[1]);
    for (const r of refs) expect(result.files.some((f) => f.name === r), r).toBe(true);
  });

  it("boot.js is a classic script that sets the cached look on <html> and needs no module loader", () => {
    const code = read(result.bootJs);
    expect(code).not.toMatch(/\bimport\s*[({]|\bexport\s/);
    for (const attr of ["data-style", "data-theme", "data-contrast", "data-density", "data-lite", "data-fs"]) expect(code, attr).toContain(attr);
    expect(code).toContain("tc:prefs");
    expect(result.files.find((x) => x.name === result.bootJs)!.gzip).toBeLessThan(2048);
  });

  it("ships each style pack as its own CSP-safe stylesheet file, not inside JS or the core css", () => {
    const packs = result.files.map((x) => x.name).filter((n) => /^pack-[A-Z0-9]{8}\.css$/.test(n));
    expect(packs.length).toBeGreaterThanOrEqual(1);
    for (const p of packs) {
      const css = read(p);
      expect(css.length).toBeGreaterThan(2000);
      expect(css).toContain("--accent");
      expect(css).not.toMatch(/@import|url\(|https?:\/\//);
      // referenced by URL from a lazy chunk (the registry links it), never by the entry
      expect(jsFiles().filter((j) => read(j).includes("/app/" + p)).length).toBe(1);
      expect(read(result.entryJs)).not.toContain(p);
    }
    // pack-only selectors are in the pack file and not in the entry stylesheet; core geometry is the other way round
    const core = read(result.entryCss);
    expect(core).toContain(".keypad");
    expect(core).toContain('[data-ui=tabs]');
    expect(core).not.toContain(".tab-pro");
    expect(packs.some((p) => read(p).includes(".tab-pro"))).toBe(true);
    for (const j of jsFiles()) expect(read(j), j).not.toContain(".tab-pro{");
  });

  it("keeps the style kit out of the entry chunk: it is a lazy import (only the chosen style is loaded)", () => {
    const main = read(result.entryJs);
    const kitFiles = jsFiles().filter((j) => read(j).includes("style-card"));
    // one kit chunk per shipped style pack (fintech, tactile, glass, techno)
    expect(kitFiles.length).toBeGreaterThanOrEqual(1);
    expect(kitFiles).not.toContain(result.entryJs);
    expect(main).not.toContain("style-card");
    // not statically imported by the entry, but reachable through import()
    const staticImports = [...main.matchAll(/(?:from|import)\s*"(\.\/chunk-[A-Z0-9]{8}\.js)"/g)].map((m) => m[1]);
    for (const k of kitFiles) expect(staticImports).not.toContain("./" + k);
    const dynamic = jsFiles().flatMap((j) => [...read(j).matchAll(/import\("\.\/(chunk-[A-Z0-9]{8}\.js)"\)/g)].map((m) => m[1]));
    for (const k of kitFiles) expect(dynamic).toContain(k);
    // the entry stays small: it carries the core and registry, not the packs
    expect(result.files.find((x) => x.name === result.entryJs)!.gzip).toBeLessThan(20 * 1024);
  });
});
