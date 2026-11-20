import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DICTIONARIES } from "../../src/i18n";
import { SITE_CSP, siteCandidates } from "../../src/site";
import { buildSite, telegramToHtml } from "../../../site/build.mjs";
import { BASE, LANGS, PAGES, allFiles, buildToTmp, pageFile, pagePath, type Built } from "./helpers";

let b: Built;
beforeAll(async () => {
  b = await buildToTmp();
}, 60_000);
afterAll(() => b.cleanup());

const ALL_PAGES = LANGS.flatMap((l) => PAGES.map((p) => [l, p] as const));
const LEGAL_PAGES = LANGS.flatMap((l) => (["privacy", "terms", "support"] as const).map((p) => [l, p] as const));
const attr = (tag: string, name: string): string | null => new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag)?.[1] ?? null;
const tags = (html: string, name: string): string[] => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((m) => m[0]);
const hreflang = (l: string): string => ({ "uz-latn": "uz-Latn", "uz-cyrl": "uz-Cyrl" } as Record<string, string>)[l] ?? l;

/** Telegram HTML message -> comparable plain text. Bullets and heading markup do not count. */
const norm = (s: string): string =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/^•\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();

describe("pages exist for every language", () => {
  it.each(ALL_PAGES)("%s /%s", (lang, page) => {
    expect(existsSync(join(b.dir, pageFile(lang, page)))).toBe(true);
  });
  it("404, robots, sitemap, favicon and hashed assets are there", () => {
    for (const f of ["404.html", "robots.txt", "sitemap.xml", "favicon.svg"]) expect(existsSync(join(b.dir, f)), f).toBe(true);
    for (const n of [b.result.cssName, b.result.bootName, b.result.appName]) {
      expect(n).toMatch(/^(site|boot|app)-[A-Z0-9]{8}\.(css|js)$/);
      expect(existsSync(join(b.dir, "site", n))).toBe(true);
    }
  });
  it("never touches public/app and removes stale files it owns", async () => {
    const d = mkdtempSync(join(tmpdir(), "site-keep-"));
    try {
      mkdirSync(join(d, "app"), { recursive: true });
      writeFileSync(join(d, "app", "index.html"), "app!");
      writeFileSync(join(d, "stale.html"), "old");
      await buildSite({ outDir: d, base: BASE, writeReview: false });
      expect(readFileSync(join(d, "app", "index.html"), "utf8")).toBe("app!");
      expect(existsSync(join(d, "stale.html"))).toBe(false);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});

describe("document basics", () => {
  it.each(ALL_PAGES)("%s /%s has lang, dir, title, description, canonical", (lang, page) => {
    const html = b.html(lang, page);
    expect(html).toContain(`<html lang="${hreflang(lang)}" dir="${lang === "ar" ? "rtl" : "ltr"}">`);
    expect(html).toMatch(/<title>[^<]{5,}<\/title>/);
    const desc = /<meta name="description" content="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(desc.length).toBeGreaterThan(20);
    expect(html).toContain(`<link rel="canonical" href="${BASE}${pagePath(lang, page)}">`);
    expect(html).toContain(`name="viewport"`);
  });
  it("404 page has lang, title and description too", () => {
    const html = b.read("404.html");
    expect(html).toMatch(/<html lang="uz-Latn" dir="ltr">/);
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    expect(html).toMatch(/<meta name="description" content="[^"]+"/);
  });
  it("Arabic is RTL everywhere, nothing else is", () => {
    for (const p of PAGES) expect(b.html("ar", p)).toContain(`dir="rtl"`);
    for (const l of LANGS.filter((x) => x !== "ar")) expect(b.html(l, "")).not.toContain(`dir="rtl"`);
  });
  it("landing has hero CTA to the bot, demo, pricing, faq and footer links", () => {
    for (const l of LANGS) {
      const h = b.html(l, "");
      expect(h, l).toContain(`href="https://t.me/tezcalc_bot"`);
      expect(h, l).toContain(`id="demo"`);
      for (const id of ["features", "pricing", "faq"]) expect(h, `${l} #${id}`).toContain(`id="${id}"`);
      for (const p of ["privacy", "terms", "support"]) expect(h, `${l} ${p}`).toContain(`href="${pagePath(l, p)}"`);
      expect(h, l).toContain("150");
      expect(h, l).toContain("@menarzullayev");
      for (const s of ["tactile", "glass", "fintech", "techno"]) expect(h, `${l} ${s}`).toContain(`data-style-btn="${s}"`);
    }
  });
  it("brand names stay Latin in Uzbek Cyrillic and the rest is Cyrillic", () => {
    const h = b.html("uz-cyrl", "");
    for (const w of ["TezCalc", "Telegram", "Pro", "Stars", "Mini App"]) expect(h).toContain(w);
    expect(h).toMatch(/[Ѐ-ӿ]{4,}/);
    expect(h).toContain("Ҳисоб");
  });
  it("legal page titles are real titles (not just the suffix)", () => {
    for (const [l, p] of LEGAL_PAGES) {
      const t = /<title>([^<]*)<\/title>/.exec(b.html(l, p))![1];
      expect(t, `${l}/${p}`).toMatch(/^\p{L}[^·]{3,} · TezCalc$/u);
    }
  });
  it("Uzbek Cyrillic landing has no stray Latin words (brand names, domains and calculator examples excepted)", () => {
    const html = b.html("uz-cyrl", "");
    const body = /<body>([\s\S]*)<\/body>/.exec(html)![1].replace(/<details class="langs">[\s\S]*?<\/details>/, "").replace(/<svg[\s\S]*?<\/svg>/g, "");
    const labels = [...body.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]).join(" ");
    const text = body.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/g, " ") + " " + labels + " " + /<title>([^<]*)/.exec(html)![1];
    const allowed = new Set(["Tez", "Calc", "TezCalc", "Telegram", "Pro", "Stars", "Mini", "App", "AC", "Tactile", "Fintech", "usd", "uzs", "to", "km", "mi", "cbu", "uz", "tezcalc_bot", "menarzullayev", "deleteme", "Starslarim"]);
    const stray = (text.match(/[A-Za-z_]{2,}/g) ?? []).filter((w) => !allowed.has(w));
    expect(stray).toEqual([]);
  });
  it("OG image only when the brand file exists", () => {
    const h = b.html("en", "");
    expect(h.includes(`${BASE}/brand/og.jpg`)).toBe(existsSync(join(b.dir, "brand", "og.jpg")));
  });
});

describe("CSP compatibility (script-src 'self'; style-src 'self'; img-src 'self' data:)", () => {
  const htmlPages = (): string[] => allFiles(b.dir).filter((f) => f.endsWith(".html"));
  it("no inline script, no <style>, no style attribute, no event handlers, no javascript: URLs", () => {
    for (const f of htmlPages()) {
      const html = readFileSync(join(b.dir, f), "utf8");
      for (const s of tags(html, "script")) expect(attr(s, "src"), `${f}: ${s}`).toMatch(/^\/site\/[\w.-]+\.js$/);
      expect(html, f).not.toMatch(/<script\b[^>]*>\s*(?!<\/script>)\S/);
      expect(html, f).not.toMatch(/<style\b/i);
      expect(html, f).not.toMatch(/\sstyle\s*=/i);
      expect(html, f).not.toMatch(/\son[a-z]+\s*=/i);
      expect(html, f).not.toMatch(/javascript:/i);
    }
  });
  it("no external resource is loaded (only <a href> and metadata links may be absolute)", () => {
    for (const f of htmlPages()) {
      const html = readFileSync(join(b.dir, f), "utf8");
      for (const t of ["script", "img", "iframe", "source", "video", "audio", "embed", "object", "form", "input"]) {
        for (const tag of tags(html, t)) for (const a of ["src", "action", "data", "srcset"]) expect(attr(tag, a) ?? "", `${f}: ${tag}`).not.toMatch(/^(https?:)?\/\//i);
      }
      for (const l of tags(html, "link")) {
        const rel = attr(l, "rel") ?? "";
        if (/stylesheet|icon|preload|modulepreload|prefetch|manifest/.test(rel)) expect(attr(l, "href"), `${f}: ${l}`).toMatch(/^\/(site|favicon|brand)/);
      }
      expect(html, f).not.toMatch(/fonts\.(googleapis|gstatic)|cdn\.|unpkg|jsdelivr|cloudflare\.com/i);
    }
  });
  it("css and js reference no external URL or @import and the js never fetches", () => {
    const css = b.read(`site/${b.result.cssName}`);
    expect(css).not.toMatch(/@import|url\(\s*["']?(https?:)?\/\//i);
    const js = b.read(`site/${b.result.appName}`) + b.read(`site/${b.result.bootName}`);
    expect(js).not.toMatch(/https?:\/\/|fetch\(|XMLHttpRequest|eval\(|new Function|document\.write|innerHTML/);
  });
  it("the Worker CSP allows exactly what the pages use", () => {
    expect(SITE_CSP).toContain("script-src 'self'");
    expect(SITE_CSP).toContain("style-src 'self'");
    expect(SITE_CSP).toContain("img-src 'self' data:");
  });
});

describe("hreflang, sitemap and robots", () => {
  it.each(ALL_PAGES)("%s /%s links every language version and x-default", (lang, page) => {
    const alts = tags(b.html(lang, page), "link").filter((t) => attr(t, "rel") === "alternate");
    expect(alts).toHaveLength(8);
    for (const l of LANGS) {
      expect(alts.some((t) => attr(t, "hreflang") === hreflang(l) && attr(t, "href") === BASE + pagePath(l, page)), hreflang(l)).toBe(true);
    }
    expect(alts.some((t) => attr(t, "hreflang") === "x-default" && attr(t, "href") === BASE + pagePath("uz-latn", page))).toBe(true);
  });
  it("sitemap lists all 28 pages with alternates; robots points at it", () => {
    const xml = b.read("sitemap.xml");
    expect([...xml.matchAll(/<url>/g)]).toHaveLength(28);
    for (const [l, p] of ALL_PAGES) expect(xml).toContain(`<loc>${BASE}${pagePath(l, p)}</loc>`);
    expect([...xml.matchAll(/<xhtml:link /g)]).toHaveLength(28 * 8);
    expect(b.read("robots.txt")).toContain(`Sitemap: ${BASE}/sitemap.xml`);
  });
});

describe("legal pages carry the bot catalog text", () => {
  const map = { privacy: "privacy", terms: "terms", support: "paysupport" } as const;
  it.each(LEGAL_PAGES)("%s /%s", (lang, page) => {
    const article = /<article class="prose">([\s\S]*?)<\/article>/.exec(b.html(lang, page))?.[1] ?? "";
    expect(article.length).toBeGreaterThan(200);
    const dict = DICTIONARIES[lang] as Record<string, string>;
    expect(norm(article)).toContain(norm(dict[map[page]]));
    if (page === "support") {
      expect(norm(article)).toContain(norm(dict.pro_cancel_info));
      expect(article).toContain("@menarzullayev");
    }
  });
  it("Telegram tags become simple HTML and nothing unknown leaks through", () => {
    const r = telegramToHtml(
      '<b>T</b>\n\n<b>H</b>\n• a <code>x</code>\n• b <i>c</i> &amp; <a href="https://x.test">l</a> <a href="javascript:alert(1)">bad</a>\n<tg-spoiler>s</tg-spoiler>\nplain /cmd',
    );
    expect(r.title).toBe("T");
    expect(r.html).toContain("<h2>H</h2>");
    expect(r.html).toContain('<ul><li>a <code dir="ltr">x</code></li>');
    expect(r.html).toContain('<a href="https://x.test" rel="noopener">l</a>');
    expect(r.html).not.toContain("javascript:");
    expect(r.html).not.toContain("tg-spoiler");
    expect(r.html).toContain("&amp;");
  });
});

describe("internal links resolve to built files (the Worker's own lookup rules)", () => {
  it("every href/src starting with / leads to a file; every #fragment to an id on the page", () => {
    const set = new Set(allFiles(b.dir).map((f) => "/" + f));
    const resolves = (path: string): boolean => siteCandidates(path).some((c) => set.has(c));
    for (const f of allFiles(b.dir).filter((x) => x.endsWith(".html"))) {
      const html = readFileSync(join(b.dir, f), "utf8");
      for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
        const v = m[1];
        if (/^(https?:|mailto:|tg:)/.test(v)) continue;
        if (v.startsWith("#")) {
          expect(html, `${f} ${v}`).toContain(`id="${v.slice(1)}"`);
          continue;
        }
        expect(v.startsWith("/"), `${f}: relative link ${v}`).toBe(true);
        expect(resolves(v.split("#")[0]), `${f}: ${v}`).toBe(true);
      }
    }
  });
});

describe("size budget", () => {
  const gz = (rel: string): number => gzipSync(readFileSync(join(b.dir, rel)), { level: 9 }).length;
  it("one page view (html + css + js) is far below 100 KB gzip", () => {
    const shared = gz(`site/${b.result.cssName}`) + gz(`site/${b.result.bootName}`) + gz(`site/${b.result.appName}`);
    for (const [l, p] of ALL_PAGES) expect(gz(pageFile(l, p)) + shared, `${l}/${p}`).toBeLessThan(40 * 1024);
    expect(shared).toBeLessThan(15 * 1024);
  });
  it("the whole site without brand images (all 28 pages) stays under 100 KB gzip", () => {
    const own = b.result.files.filter((f) => !f.name.startsWith("brand/"));
    expect(own.reduce((a, f) => a + f.gzip, 0)).toBeLessThan(100 * 1024);
  });
  it("no web fonts or images are shipped by the site itself", () => {
    const own = b.result.files.filter((f) => !f.name.startsWith("brand/")).map((f) => f.name);
    expect(own.filter((n) => /\.(woff2?|ttf|otf|png|jpe?g|gif|webp)$/.test(n))).toEqual([]);
  });
});
