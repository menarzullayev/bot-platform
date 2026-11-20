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
    for (const n of names.filter((x) => x !== "index.html")) expect(n, n).toMatch(/^(main|chunk)-[A-Z0-9]{8}\.(js|css)$/);
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
      const hosts = new Set([...code.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase()));
      for (const h of hosts) expect(["www.w3.org"], `${f} references ${h}`).toContain(h);
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
    const refs = [...read("index.html").matchAll(/\/app\/((?:main|chunk)-[A-Z0-9]{8}\.(?:js|css))/g)].map((m) => m[1]);
    for (const r of refs) expect(result.files.some((f) => f.name === r), r).toBe(true);
  });
});
